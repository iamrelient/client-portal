import sharp from "sharp";
import path from "path";
import fs from "fs";

const WATERMARKABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Padding as a fraction of image width (2%) — tighter to the corner */
const PADDING_RATIO = 0.02;
const MIN_PADDING = 20;

/** Watermark opacity (0 = invisible, 1 = fully opaque) */
const WATERMARK_OPACITY = 0.5;

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

let cachedFloorWatermark: Buffer | null = null;
let floorWatermarkMissing = false;

function getFloorWatermarkBuffer(): Buffer | null {
  if (floorWatermarkMissing) return null;
  if (cachedFloorWatermark) return cachedFloorWatermark;
  const watermarkPath = path.join(process.cwd(), "public", "floor-watermark.png");
  try {
    cachedFloorWatermark = fs.readFileSync(watermarkPath);
    return cachedFloorWatermark;
  } catch {
    console.warn(
      `Floor watermark file not found at ${watermarkPath} — skipping`
    );
    floorWatermarkMissing = true;
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
    // Then apply 50% opacity via ensureAlpha + linear transform on alpha channel
    const targetWatermarkWidth = Math.round(imgWidth * 0.15);
    const watermark = await sharp(watermarkBuf)
      .resize({ width: targetWatermarkWidth, withoutEnlargement: true })
      .ensureAlpha(WATERMARK_OPACITY)
      .composite([{
        input: Buffer.from([255, 255, 255, Math.round(255 * WATERMARK_OPACITY)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      }])
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

/** Floor watermark opacity — softer than the corner stamp because it's
 *  meant to read like a projection on the ground, not a label. */
const FLOOR_WATERMARK_OPACITY = 0.32;

/**
 * Composites the pre-warped floor watermark (`public/floor-watermark.png`)
 * onto the bottom-center of an equirectangular panorama image. When
 * unwrapped onto the sphere by Pannellum, the warped overlay reads as a
 * flat logo printed on the floor.
 *
 * The floor watermark PNG is generated once by `scripts/generate-floor-
 * watermark.ts` and lives in `public/`. Composite size scales with the
 * panorama width so the logo's apparent size stays the same regardless
 * of the source resolution.
 *
 * Returns the original buffer unchanged if the mime type isn't a
 * watermarkable image, the floor watermark is missing, or processing
 * throws.
 */
export async function applyFloorWatermark(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  if (!isWatermarkable(mimeType)) return buffer;

  const watermarkBuf = getFloorWatermarkBuffer();
  if (!watermarkBuf) return buffer;

  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;
    if (!imgWidth || !imgHeight) return buffer;

    // The pre-warped overlay is authored to span the bottom strip of an
    // equirectangular image. We render it at the panorama's full width so
    // the warping math matches the original assumptions exactly. The
    // overlay's natural aspect (4:1) sets the height.
    const targetWidth = imgWidth;
    const watermark = await sharp(watermarkBuf)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .ensureAlpha()
      .composite([
        {
          // Pull the alpha channel down to the floor opacity so the logo
          // reads as a soft projection rather than a stamp.
          input: Buffer.from([
            255,
            255,
            255,
            Math.round(255 * FLOOR_WATERMARK_OPACITY),
          ]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: "dest-in",
        },
      ])
      // Soft blur so the projection edge isn't crisp — looks more like
      // light bouncing off the floor.
      .blur(0.6)
      .toBuffer();

    const wmMeta = await sharp(watermark).metadata();
    const wmWidth = wmMeta.width || targetWidth;
    const wmHeight = wmMeta.height || Math.round(targetWidth / 4);

    // Anchor the overlay so its bottom edge aligns with the panorama's
    // bottom edge, horizontally centered. The pre-warp already accounts
    // for the south-pole singularity at the bottom row.
    const left = Math.max(0, Math.round((imgWidth - wmWidth) / 2));
    const top = Math.max(0, imgHeight - wmHeight);

    let pipeline = image.composite([{ input: watermark, left, top }]);

    if (mimeType === "image/jpeg") {
      pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    } else if (mimeType === "image/png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (mimeType === "image/webp") {
      pipeline = pipeline.webp({ quality: 90 });
    }

    return await pipeline.toBuffer();
  } catch (err) {
    console.error("Floor watermark processing failed, returning original:", err);
    return buffer;
  }
}
