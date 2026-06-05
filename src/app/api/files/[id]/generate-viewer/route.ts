import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadFile, uploadFileToFolder } from "@/lib/google-drive";
import { isWatermarkable } from "@/lib/watermark";
import {
  buildViewerDerivative,
  viewerDerivativeFilename,
} from "@/lib/image-derivatives";

// Heavy Sharp work (download + decode + downscale + watermark +
// re-upload) on up to ~16K images. 300 s is the Vercel Pro cap on a
// regular function. This runs as its own request — fire-and-forget
// from the client after upload — so even if it OOMs or times out the
// upload itself already succeeded and the asset route falls back to
// serve-time handling.
export const maxDuration = 300;

/**
 * Generate the viewer-optimized derivative (≤4K JPEG, watermark
 * baked) for an already-uploaded file and stamp the result on the
 * File row. Decoupled from the upload path on purpose: a 16 MB
 * panorama was OOM-ing the upload-complete function and reporting
 * "upload failed" even though the file landed fine. Now the upload
 * always succeeds and this is best-effort.
 *
 * Idempotent: if the derivative already exists it no-ops, so the
 * client can safely fire it without tracking state.
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

    // Already have a derivative — nothing to do.
    if (file.viewerDriveFileId) {
      return NextResponse.json({ message: "Derivative already exists" });
    }

    if (!isWatermarkable(file.mimeType)) {
      return NextResponse.json({ message: "Not a derivable image type" });
    }

    if (!file.project?.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    // Download current bytes from Drive.
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

    const derivative = await buildViewerDerivative(sourceBuf, file.mimeType, {
      isPanorama: file.isPanorama,
      // Panoramas: bake the floor watermark into the derivative when
      // the project wants watermarking. Non-panoramas already got the
      // corner watermark baked into the source during upload-complete,
      // so the derivative just downscales (watermark: false) and
      // inherits whatever the source has.
      watermark: file.isPanorama && file.project.watermarkEnabled,
    });

    if (!derivative) {
      // Source was already small + clean — no derivative warranted.
      return NextResponse.json({ message: "No derivative needed" });
    }

    const viewerDriveResult = await uploadFileToFolder(
      file.project.driveFolderId,
      viewerDerivativeFilename(file.originalName),
      derivative.mimeType,
      derivative.buffer
    );

    await prisma.file.update({
      where: { id: file.id },
      data: {
        viewerDriveFileId: viewerDriveResult.id,
        viewerMimeType: derivative.mimeType,
        viewerSize: derivative.buffer.length,
        viewerWidth: derivative.width,
        viewerHeight: derivative.height,
        viewerHasWatermark: file.isPanorama
          ? derivative.hasWatermark
          : file.project.watermarkEnabled,
      },
    });

    return NextResponse.json({ message: "Derivative generated" });
  } catch (error) {
    console.error("Generate viewer derivative error:", error);
    // Non-fatal to the caller — they fire-and-forget. Surface a 500
    // for logging/debugging but the file still works via serve-time.
    return NextResponse.json(
      { error: "Derivative generation failed" },
      { status: 500 }
    );
  }
}
