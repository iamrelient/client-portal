import sharp from "sharp";
import path from "path";
import fs from "fs";

const WATERMARKABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Padding as a fraction of image width (5%) */
const PADDING_RATIO = 0.05;
const MIN_PADDING = 40;

let cachedWatermark: Buffer | null = null;
let watermarkMissing = false;

function getWatermarkBuffer(): Buffer | null {
  if (watermarkMissing) return null;
  if (cachedWatermark) return cachedWatermark;

  const watermarkPath = path.join(process.cwd(), "public", "watermark.png");
  try {
    cachedWatermark = fs.readFileSync(watermarkPath);
    return cachedWatermark;
  } catch {
    console.warn(
      `Watermark file not found at ${watermarkPath} — skipping watermark`
    );
    watermarkMissing = true;
    return null;
  }
}

/**
 * Returns true if the given MIME type is a watermarkable image.
 */
export function isWatermarkable(mimeType: string): boolean {
  return WATERMARKABLE_TYPES.has(mimeType);
}

/**
 * Applies a watermark to an image buffer.
 * Returns the original buffer unchanged if:
 *  - mimeType is not a supported image type
 *  - watermark.png is missing from public/
 *  - any processing error occurs
 */
export async function applyWatermark(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  if (!isWatermarkable(mimeType)) return buffer;

  const watermarkBuf = getWatermarkBuffer();
  if (!watermarkBuf) return buffer;

  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const imgWidth = metadata.width || 1920;
    const imgHeight = metadata.height || 1080;

    // Resize watermark to ~15% of image width, preserving aspect ratio
    const targetWatermarkWidth = Math.round(imgWidth * 0.15);
    const watermark = await sharp(watermarkBuf)
      .resize({ width: targetWatermarkWidth, withoutEnlargement: true })
      .toBuffer();

    const wmMeta = await sharp(watermark).metadata();
    const wmWidth = wmMeta.width || targetWatermarkWidth;
    const wmHeight = wmMeta.height || Math.round(targetWatermarkWidth * 0.5);

    // Padding: 5% of image width, minimum 40px
    const padding = Math.max(Math.round(imgWidth * PADDING_RATIO), MIN_PADDING);

    // Position: bottom-right with padding (southeast anchor)
    const left = imgWidth - wmWidth - padding;
    const top = imgHeight - wmHeight - padding;

    // Composite and output in the same format with high quality
    let pipeline = image.composite([
      { input: watermark, left: Math.max(0, left), top: Math.max(0, top) },
    ]);

    if (mimeType === "image/jpeg") {
      pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
    } else if (mimeType === "image/png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (mimeType === "image/webp") {
      pipeline = pipeline.webp({ quality: 92 });
    }

    return await pipeline.toBuffer();
  } catch (err) {
    console.error("Watermark processing failed, returning original:", err);
    return buffer;
  }
}
