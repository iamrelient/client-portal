import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";
import { applyFloorWatermark, isWatermarkable } from "@/lib/watermark";

// Floor-watermarking buffers the entire image in memory and runs sharp,
// which can take a few seconds on a 8K panorama. Lift the default 10s
// Vercel timeout to the 60s Hobby ceiling.
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
    });

    if (!presentation || !presentation.isActive) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json(
        { error: "This presentation has expired" },
        { status: 403 }
      );
    }

    // Verify password cookie if password-protected
    if (presentation.password) {
      const cookieStore = cookies();
      const authCookie = cookieStore.get(`pres_${presentation.id}`);

      if (!authCookie || authCookie.value !== presentation.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Verify this file belongs to a section of this presentation or is the client logo
    const isClientLogo = presentation.clientLogo === params.fileId;

    if (!isClientLogo) {
      const section = await prisma.presentationSection.findFirst({
        where: {
          presentationId: presentation.id,
          fileId: params.fileId,
        },
      });

      if (!section) {
        // Check if file is referenced in any section's metadata (hotspot images, PDFs, floor plans)
        const allSections = await prisma.presentationSection.findMany({
          where: { presentationId: presentation.id },
          select: { id: true, metadata: true },
        });

        const referencedInMetadata = allSections.some((s) => {
          if (!s.metadata) return false;
          const metaStr = JSON.stringify(s.metadata);
          return metaStr.includes(params.fileId);
        });

        if (!referencedInMetadata) {
          return NextResponse.json(
            { error: "File not found in presentation" },
            { status: 404 }
          );
        }
      }
    }

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const { stream } = await downloadFile(file.path);

    // Floor-projected watermark: when the file is a 360° panorama and the
    // presentation has watermarking + the panorama floor watermark turned
    // on, buffer the bytes, composite the pre-warped logo onto the bottom
    // of the equirectangular image, and stream the result. Skip otherwise
    // so non-panorama files keep streaming without buffering.
    const shouldFloorWatermark =
      presentation.watermarkEnabled &&
      presentation.panoramaFloorWatermark &&
      file.isPanorama &&
      isWatermarkable(file.mimeType);

    if (shouldFloorWatermark) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const original = Buffer.concat(chunks);
      const watermarked = await applyFloorWatermark(original, file.mimeType);
      // NextResponse expects a BodyInit; hand it the underlying ArrayBuffer.
      const body = watermarked.buffer.slice(
        watermarked.byteOffset,
        watermarked.byteOffset + watermarked.byteLength
      ) as ArrayBuffer;
      return new NextResponse(body, {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename="${file.originalName}"`,
          "Content-Length": String(watermarked.length),
          "Cache-Control": "private, max-age=3600, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.originalName}"`,
        "Cache-Control": "private, max-age=3600, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Serve presentation asset error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
