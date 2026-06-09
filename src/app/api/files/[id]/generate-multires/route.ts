import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  downloadFile,
  uploadFileToFolder,
  createFolder,
} from "@/lib/google-drive";
import { isWatermarkable } from "@/lib/watermark";
import { buildMultiresPyramid } from "@/lib/multires";

// Heaviest job in the app: download the 6K original, project it onto 6
// cube faces in JS, encode ~130 tile JPEGs, and upload them all to
// Drive. The build itself is ~4 s; the tile uploads dominate (about a
// minute at concurrency 8). 300 s is the Vercel Pro cap and leaves
// comfortable headroom.
export const maxDuration = 300;

/** Parallel-upload tiles with a small concurrency cap — enough to hide
 *  Drive latency without tripping its rate limits. */
async function uploadTiles(
  folderId: string,
  tiles: { path: string; buffer: Buffer }[]
): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  const CONCURRENCY = 8;
  let cursor = 0;
  let firstError: unknown = null;

  async function worker() {
    while (cursor < tiles.length && !firstError) {
      const tile = tiles[cursor++];
      try {
        // Flat names inside the per-pano folder; "/" is legal in Drive
        // names but confusing — use "_" ("3_f0_2.jpg").
        const name = tile.path.replace(/\//g, "_") + ".jpg";
        const res = await uploadFileToFolder(
          folderId,
          name,
          "image/jpeg",
          tile.buffer
        );
        manifest[tile.path] = res.id;
      } catch (err) {
        firstError = err;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker)
  );
  if (firstError) throw firstError;
  return manifest;
}

/**
 * Build + store the multires tile pyramid for a panorama. Idempotent:
 * no-ops when a pyramid already exists with the same watermark intent.
 * Fire-and-forget safe — failure leaves the equirect derivative path
 * fully functional.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: params.id },
      include: {
        project: {
          select: { id: true, driveFolderId: true, watermarkEnabled: true },
        },
      },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    if (!file.isPanorama) {
      return NextResponse.json({ message: "Not a panorama — skipped" });
    }
    if (!isWatermarkable(file.mimeType)) {
      return NextResponse.json({ message: "Not a tileable image type" });
    }
    if (!file.project?.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    const wantsWatermark = file.project.watermarkEnabled;

    // Already built with the same watermark intent — nothing to do.
    if (file.multiresManifest && file.multiresHasWatermark === wantsWatermark) {
      return NextResponse.json({ message: "Pyramid already exists" });
    }

    // Download original bytes from Drive.
    const { stream } = await downloadFile(file.path);
    const chunks: Uint8Array[] = [];
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    let done = false;
    while (!done) {
      const r = await reader.read();
      if (r.value) chunks.push(r.value);
      done = r.done;
    }
    const sourceBuf = Buffer.concat(chunks);

    const pyramid = await buildMultiresPyramid(sourceBuf, file.mimeType, {
      watermark: wantsWatermark,
    });
    if (!pyramid) {
      return NextResponse.json({ message: "Source not processable" });
    }

    // Tiles live in a per-pano subfolder so the project's root folder
    // (which the Drive sync scans) stays clean.
    const tileFolderId = await createFolder(
      `.tiles-${file.id}`,
      file.project.driveFolderId
    );
    const manifest = await uploadTiles(tileFolderId, pyramid.tiles);

    await prisma.file.update({
      where: { id: file.id },
      data: {
        multiresManifest: manifest,
        multiresMaxLevel: pyramid.maxLevel,
        multiresCubeRes: pyramid.cubeRes,
        multiresTileRes: pyramid.tileRes,
        multiresHasWatermark: pyramid.hasWatermark,
      },
    });

    return NextResponse.json({
      message: "Pyramid generated",
      tiles: pyramid.tiles.length,
      maxLevel: pyramid.maxLevel,
      cubeRes: pyramid.cubeRes,
    });
  } catch (error) {
    console.error("Generate multires error:", error);
    return NextResponse.json(
      { error: "Multires generation failed" },
      { status: 500 }
    );
  }
}
