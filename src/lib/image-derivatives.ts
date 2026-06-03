/**
 * Viewer-optimized image derivatives.
 *
 * The presentation viewer doesn't need full-resolution 4K / 8K source
 * files. A typical client watches on a 1080p–1440p laptop or a 4K
 * monitor; Pannellum's WebGL texture cap is 4096 anyway on most
 * devices. Streaming an 80 MB 8K equirectangular panorama through a
 * serve-time Sharp pipeline is both bandwidth-wasteful and a memory
 * risk on Vercel functions (raw RGBA for 16384×8192 = ~512 MB).
 *
 * This module builds a derivative at upload time:
 *   • Downscaled to VIEWER_MAX_WIDTH (4096) if the source is bigger.
 *   • Watermark baked in:
 *       - Floor-projected logo for panoramas (reads correctly when
 *         unwrapped onto the sphere by Pannellum).
 *       - Corner stamp for everything else.
 *   • Re-encoded as JPEG (~1–3 MB for a 4K panorama, ~150–400 KB for
 *     a 4K hero shot — predictable, fast, universal browser support).
 *
 * The original Drive file is never modified. The derivative lives as
 * a sibling Drive file whose id is stored on the `File` row's
 * `viewerDriveFileId`. The asset route prefers it over the original
 * when serving to the presentation viewer.
 */

import sharp from "sharp";
import {
  applyFloorWatermark,
  applyWatermark,
  isWatermarkable,
} from "./watermark";

/** Universal WebGL safe upper bound. 4096 is supported on every
 *  device that runs Pannellum at all. 8192 would fail on some iOS
 *  / older Android, so we don't push past 4K even when the source
 *  is bigger. Bandwidth wins are huge: an 8K JPEG is roughly 3-4×
 *  the size of a 4K JPEG of the same content. */
const VIEWER_MAX_WIDTH = 4096;

/** Anything smaller than this gets passed through untouched (no
 *  derivative). A 2K-or-smaller image is already lean; generating
 *  a "derivative" the same size just wastes Drive storage. The
 *  exception is when watermarking is needed and the original
 *  doesn't have it baked in — covered separately. */
const DERIVATIVE_SKIP_BELOW_WIDTH = 2048;

/** JPEG quality for derivatives. 88 is the sweet spot — visually
 *  indistinguishable from the original for photo content, but
 *  pulls file sizes down by 4-6× versus quality=100. */
const DERIVATIVE_QUALITY = 88;

// Tighten Sharp's defaults so giant inputs don't get rejected or
// silently consume runaway memory. The asset / upload routes set
// their own maxDuration; this just keeps Sharp from being the
// thing that breaks.
//   - limitInputPixels: 16384 × 16384 × 8 = ~2.1 G px — comfortably
//     covers any equirectangular panorama up to 16K plus headroom.
//     Default is 268 M px which an 8K (134 M) clears but a 16K
//     (537 M) does not.
//   - concurrency(1): serialize libvips work threads. Counter-
//     intuitive but on small Vercel functions the parallelism
//     causes more memory pressure than it saves wall time.
//   - cache(false): don't hold decoded buffers between calls —
//     functions are short-lived and we don't benefit.
sharp.cache(false);
sharp.concurrency(1);

const SHARP_INPUT_LIMIT = 16384 * 16384 * 8;

export interface DerivativeBuildOptions {
  isPanorama: boolean;
  /** When true, watermark gets composited into the derivative. When
   *  false, derivative is clean (used when project.watermarkEnabled
   *  is off at upload time). */
  watermark: boolean;
}

export interface DerivativeResult {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  /** Mirrors the `watermark` option — recorded on the File row so
   *  the asset route can fall back to the original if a downstream
   *  presentation later disables watermarks. */
  hasWatermark: boolean;
}

/**
 * Build the viewer-optimized derivative for an image buffer.
 *
 * Returns null when the source isn't a watermarkable image or when
 * no derivative is warranted (small image + no watermark needed) —
 * the caller should fall back to serving the original in that case.
 */
export async function buildViewerDerivative(
  buffer: Buffer,
  mimeType: string,
  opts: DerivativeBuildOptions
): Promise<DerivativeResult | null> {
  if (!isWatermarkable(mimeType)) return null;

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: SHARP_INPUT_LIMIT }).metadata();
  } catch (err) {
    console.warn("Derivative: failed to read source metadata", err);
    return null;
  }
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  if (!srcWidth || !srcHeight) return null;

  const needsResize = srcWidth > VIEWER_MAX_WIDTH;
  const needsWatermark = opts.watermark;

  // Skip if the original is already viewer-sized AND no watermark
  // baking is required. Nothing useful for us to do; let the asset
  // route serve the original directly.
  if (!needsResize && !needsWatermark && srcWidth < DERIVATIVE_SKIP_BELOW_WIDTH) {
    return null;
  }
  if (!needsResize && !needsWatermark) {
    // Source is already small-ish and clean — no benefit.
    return null;
  }

  try {
    // Step 1: downscale + re-encode to JPEG. Doing the encode here
    // (before watermark) ensures the watermark functions operate
    // on a manageable buffer instead of the raw 8K input.
    let resized = sharp(buffer, { limitInputPixels: SHARP_INPUT_LIMIT });
    if (needsResize) {
      resized = resized.resize({
        width: VIEWER_MAX_WIDTH,
        withoutEnlargement: true,
        // Lanczos3 — best perceived quality for photo content at
        // these reduction ratios.
        kernel: "lanczos3",
      });
    }
    const downscaled = await resized
      .jpeg({ quality: DERIVATIVE_QUALITY, mozjpeg: true })
      .toBuffer();

    // Step 2: watermark on the downscaled buffer (cheap — Sharp
    // only has to handle 4K max at this point, never 8K).
    let watermarked = downscaled;
    if (needsWatermark) {
      watermarked = opts.isPanorama
        ? await applyFloorWatermark(downscaled, "image/jpeg")
        : await applyWatermark(downscaled, "image/jpeg");
    }

    // Re-read metadata from the final buffer for accurate dimensions
    // (watermark composite preserves size but the resize might have
    // adjusted height for odd aspect ratios).
    const outMeta = await sharp(watermarked).metadata();
    const outWidth = outMeta.width ?? VIEWER_MAX_WIDTH;
    const outHeight =
      outMeta.height ?? Math.round((outWidth * srcHeight) / srcWidth);

    return {
      buffer: watermarked,
      mimeType: "image/jpeg",
      width: outWidth,
      height: outHeight,
      hasWatermark: needsWatermark,
    };
  } catch (err) {
    console.error("Derivative build failed:", err);
    return null;
  }
}

/**
 * Generates a Drive-safe filename for a viewer derivative. Strips the
 * source extension, adds a "viewer-" prefix + ".jpg" so the file is
 * recognizable in the Drive folder listing.
 */
export function viewerDerivativeFilename(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  return `viewer-${base}.jpg`;
}
