import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";

/**
 * Serves one multires tile to the presentation viewer.
 *
 * URL shape matches the Pannellum config built in panorama-viewer:
 *   /api/present/{token}/tiles/{fileId}/{level}/{face}{y}_{x}.jpg
 *   /api/present/{token}/tiles/{fileId}/fallback/{face}.jpg
 *
 * The manifest on the File row maps "level/facey_x" → Drive file id.
 * Tiles are immutable once generated, so they get the longest cache we
 * use anywhere — after the first viewer in a region, a tile is a ~10 ms
 * edge hit. Each response is tiny (~5–60 KB), so even the cold path is
 * quick.
 */
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { token: string; fileId: string; tile: string[] } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
      select: {
        id: true,
        isActive: true,
        expiresAt: true,
        password: true,
      },
    });

    if (!presentation || !presentation.isActive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json({ error: "Expired" }, { status: 403 });
    }
    if (presentation.password) {
      const authCookie = cookies().get(`pres_${presentation.id}`);
      if (!authCookie || authCookie.value !== presentation.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // The file must back one of this presentation's sections. (Multires
    // tiles only exist for section panoramas, so this single check is
    // both necessary and sufficient — no metadata-blob scan needed.)
    const section = await prisma.presentationSection.findFirst({
      where: { presentationId: presentation.id, fileId: params.fileId },
      select: { id: true },
    });
    if (!section) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
      select: { multiresManifest: true },
    });
    const manifest = file?.multiresManifest as Record<string, string> | null;
    if (!manifest) {
      return NextResponse.json({ error: "No tiles" }, { status: 404 });
    }

    // "3/f0_2.jpg" → manifest key "3/f0_2". Reject path-traversal-ish
    // input by construction: only known manifest keys resolve.
    const key = params.tile.join("/").replace(/\.jpg$/i, "");
    const driveId = manifest[key];
    if (!driveId) {
      return NextResponse.json({ error: "Tile not found" }, { status: 404 });
    }

    const { stream } = await downloadFile(driveId);
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "image/jpeg",
        // Tiles are immutable — regenerating a pyramid writes NEW Drive
        // ids into the manifest, so stale cache entries can never be
        // served under a current URL. Cache as hard as possible; the
        // password-protected case stays private (cookie-gated).
        "Cache-Control": presentation.password
          ? "private, max-age=86400, immutable"
          : "public, s-maxage=31536000, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Serve tile error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
