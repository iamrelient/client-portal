import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";
import sharp from "sharp";

/**
 * Link-preview (Open Graph) card image for a shared presentation.
 *
 * Returns a clean 1200×630 JPEG — the canonical link-card size — so the
 * thumbnail unfurls crisply in iMessage / Slack / email instead of the
 * raw source image (wrong aspect ratio, and a 6K file is often too big
 * for unfurlers to fetch, so no image shows at all). We cover-crop the
 * presentation's cover (or first hero/image/panorama) to 1200×630 and
 * re-encode small (~100–200 KB) so it always loads.
 *
 * Public by design: the token is already the unguessable capability in
 * the URL. Password-protected decks get NO image (the cover sits behind
 * the gate) — the preview still shows the title/description from the
 * page's OG tags, just no thumbnail.
 */
export const maxDuration = 30;

const OG_W = 1200;
const OG_H = 630;

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
      select: {
        isActive: true,
        password: true,
        tourHeroFileId: true,
        sections: {
          orderBy: { order: "asc" },
          select: { type: true, fileId: true },
        },
      },
    });

    if (!presentation || !presentation.isActive || presentation.password) {
      return NextResponse.json({ error: "No card" }, { status: 404 });
    }

    const heroFileId =
      presentation.tourHeroFileId ||
      presentation.sections.find(
        (s) =>
          (s.type === "hero" || s.type === "image" || s.type === "panorama") &&
          s.fileId
      )?.fileId ||
      null;

    if (!heroFileId) {
      return NextResponse.json({ error: "No image" }, { status: 404 });
    }

    const file = await prisma.file.findUnique({
      where: { id: heroFileId },
      select: { path: true, viewerDriveFileId: true },
    });
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 404 });
    }

    // Prefer the pre-baked viewer derivative (≤4K, small) over the raw
    // original — faster to fetch and plenty of detail for a 1200px card.
    const sourceDriveId = file.viewerDriveFileId || file.path;

    const { stream } = await downloadFile(sourceDriveId);
    const chunks: Uint8Array[] = [];
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    let done = false;
    while (!done) {
      const r = await reader.read();
      if (r.value) chunks.push(r.value);
      done = r.done;
    }
    const original = Buffer.concat(chunks);

    // A panorama source is a 2:1 equirect — cover-cropping it to 1.9:1
    // would show a distorted, pole-stretched strip. Crop from the
    // horizontal middle band (attention: center) which reads fine.
    const card = await sharp(original, { limitInputPixels: 16384 * 16384 * 8 })
      .resize(OG_W, OG_H, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const body = card.buffer.slice(
      card.byteOffset,
      card.byteOffset + card.byteLength
    ) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(card.length),
        // Unfurlers cache hard; a day of edge cache is plenty and keeps
        // the first share snappy.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Presentation OG card error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
