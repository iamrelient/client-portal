/**
 * Multiresolution tile pyramid builder (Matterport-style streaming).
 *
 * Converts an equirectangular panorama into the cube-face tile pyramid
 * Pannellum's `multires` mode consumes:
 *
 *   • The equirect is projected onto 6 cube faces (f, b, u, d, l, r)
 *     via per-pixel bilinear sampling — same math as Pannellum's own
 *     generate.py, implemented here in pure JS on raw RGB buffers so it
 *     runs in a Vercel function (no hugin/nona binary available).
 *   • Each face is sliced into TILE_RES×TILE_RES JPEG tiles at every
 *     pyramid level (level 1 = smallest … maxLevel = native face res).
 *   • 1024px whole-face "fallback" JPEGs are produced for clients whose
 *     WebGL context can't handle the tile shader.
 *
 * Why: the viewer then streams ONLY the tiles in view at the detail
 * needed. First paint needs just the tiny base level (~hundreds of KB
 * vs. 1–3 MB for the single 4K JPEG), and zooming reaches the FULL 6K+
 * source detail — the 4096px single-texture WebGL cap applies per tile,
 * not per panorama, so phones get the sharp version too.
 *
 * Tile naming matches Pannellum's default URL template
 * (path: "/%l/%s%y_%x", fallbackPath: "/fallback/%s"):
 *   "<level>/<face><y>_<x>"  e.g. "3/f0_2"
 *   "fallback/<face>"        e.g. "fallback/f"
 */

import sharp from "sharp";
import { applyFloorWatermark, isWatermarkable } from "./watermark";

/** Tile edge length. 512 is Pannellum's canonical choice — small
 *  enough for cheap partial loads, big enough to keep request counts
 *  sane (~130 tiles for a 6K pano). */
export const TILE_RES = 512;

/** Whole-face fallback resolution for non-multires-capable clients. */
const FALLBACK_RES = 1024;

/** JPEG quality for tiles. Slightly below the single-derivative's 88:
 *  tiles are viewed at native scale (no downsampling headroom needed)
 *  and the count multiplies any size win. 82 is visually transparent
 *  for photographic content. */
const TILE_QUALITY = 82;

const SHARP_INPUT_LIMIT = 16384 * 16384 * 8;

export interface MultiresTile {
  /** Manifest key / URL path segment, e.g. "3/f0_2" or "fallback/f". */
  path: string;
  buffer: Buffer;
}

export interface MultiresPyramid {
  tiles: MultiresTile[];
  maxLevel: number;
  cubeRes: number;
  tileRes: number;
  hasWatermark: boolean;
}

const FACES = ["f", "b", "u", "d", "l", "r"] as const;
type Face = (typeof FACES)[number];

/** Direction vector for a face pixel. (a, b) ∈ [-1, 1] are the
 *  horizontal/vertical positions on the face plane (b grows downward).
 *  Orientations follow Pannellum's generate.py: front looks +z, right
 *  +x, up +y. */
function faceDir(face: Face, a: number, b: number): [number, number, number] {
  switch (face) {
    case "f":
      return [a, -b, 1];
    case "b":
      return [-a, -b, -1];
    case "r":
      return [1, -b, -a];
    case "l":
      return [-1, -b, a];
    case "u":
      return [a, 1, b];
    case "d":
      return [a, -1, -b];
  }
}

/**
 * Render one cube face from raw equirect RGB pixels via bilinear
 * sampling. Horizontal axis wraps (360°); vertical clamps at the poles.
 */
function renderFace(
  src: Buffer,
  srcW: number,
  srcH: number,
  face: Face,
  faceRes: number
): Buffer {
  const out = Buffer.allocUnsafe(faceRes * faceRes * 3);
  const twoPi = Math.PI * 2;

  let o = 0;
  for (let j = 0; j < faceRes; j++) {
    const b = (2 * (j + 0.5)) / faceRes - 1;
    for (let i = 0; i < faceRes; i++) {
      const a = (2 * (i + 0.5)) / faceRes - 1;
      const [x, y, z] = faceDir(face, a, b);

      const lon = Math.atan2(x, z); // 0 at +z (image center)
      const len = Math.sqrt(x * x + y * y + z * z);
      const lat = Math.asin(y / len);

      // Equirect coords: center column = lon 0, top row = lat +π/2.
      let px = ((lon + Math.PI) / twoPi) * srcW - 0.5;
      const py = ((Math.PI / 2 - lat) / Math.PI) * srcH - 0.5;

      // Bilinear sample with horizontal wrap, vertical clamp.
      if (px < 0) px += srcW;
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const x1 = (x0 + 1) % srcW;
      const xa = x0 % srcW;
      const ya = Math.min(Math.max(y0, 0), srcH - 1);
      const yb = Math.min(Math.max(y0 + 1, 0), srcH - 1);

      const i00 = (ya * srcW + xa) * 3;
      const i10 = (ya * srcW + x1) * 3;
      const i01 = (yb * srcW + xa) * 3;
      const i11 = (yb * srcW + x1) * 3;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      out[o++] =
        src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[o++] =
        src[i00 + 1] * w00 +
        src[i10 + 1] * w10 +
        src[i01 + 1] * w01 +
        src[i11 + 1] * w11;
      out[o++] =
        src[i00 + 2] * w00 +
        src[i10 + 2] * w10 +
        src[i01 + 2] * w01 +
        src[i11 + 2] * w11;
    }
  }
  return out;
}

/**
 * Build the full multires pyramid for an equirectangular panorama.
 *
 * Returns null when the input isn't a processable image. Throws on
 * processing errors (caller decides how to surface).
 */
export async function buildMultiresPyramid(
  buffer: Buffer,
  mimeType: string,
  opts: { watermark: boolean }
): Promise<MultiresPyramid | null> {
  if (!isWatermarkable(mimeType)) return null;

  // Bake the floor watermark into the equirect BEFORE projection so it
  // wraps correctly onto the down face, matching the single-derivative
  // pipeline's look.
  let source = buffer;
  if (opts.watermark) {
    source = await applyFloorWatermark(buffer, mimeType);
  }

  const img = sharp(source, { limitInputPixels: SHARP_INPUT_LIMIT });
  const meta = await img.metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) return null;

  // Raw RGB for sampling. ~57 MB for a 6K equirect — fine for a
  // dedicated function; freed when this call returns.
  const raw = await img.removeAlpha().raw().toBuffer();

  // Native face resolution: width/π (the equator's pixels-per-radian),
  // rounded down to a multiple of 8 like generate.py. A 6144-wide pano
  // → 1952px faces → 3 levels (1952 / 976 / 488).
  const cubeRes = Math.max(8, 8 * Math.floor(srcW / Math.PI / 8));
  let maxLevel = 1;
  while (Math.ceil(cubeRes / Math.pow(2, maxLevel - 1)) > TILE_RES) {
    maxLevel++;
  }

  const tiles: MultiresTile[] = [];

  for (const face of FACES) {
    const faceRaw = renderFace(raw, srcW, srcH, face, cubeRes);
    const faceSharp = sharp(faceRaw, {
      raw: { width: cubeRes, height: cubeRes, channels: 3 },
      limitInputPixels: SHARP_INPUT_LIMIT,
    });
    // Re-encode once to PNG-in-memory? No — keep raw; resize from the
    // raw buffer per level (sharp can't be reused after toBuffer, so
    // clone() per operation).

    for (let level = maxLevel; level >= 1; level--) {
      const levelRes = Math.ceil(cubeRes / Math.pow(2, maxLevel - level));
      const levelBuf =
        level === maxLevel
          ? faceRaw
          : await faceSharp
              .clone()
              .resize(levelRes, levelRes, { kernel: "lanczos3" })
              .raw()
              .toBuffer();

      const levelSharp = sharp(levelBuf, {
        raw: { width: levelRes, height: levelRes, channels: 3 },
        limitInputPixels: SHARP_INPUT_LIMIT,
      });

      const tilesAcross = Math.ceil(levelRes / TILE_RES);
      for (let ty = 0; ty < tilesAcross; ty++) {
        for (let tx = 0; tx < tilesAcross; tx++) {
          const w = Math.min(TILE_RES, levelRes - tx * TILE_RES);
          const h = Math.min(TILE_RES, levelRes - ty * TILE_RES);
          const tileBuf = await levelSharp
            .clone()
            .extract({
              left: tx * TILE_RES,
              top: ty * TILE_RES,
              width: w,
              height: h,
            })
            .jpeg({ quality: TILE_QUALITY, mozjpeg: true })
            .toBuffer();
          tiles.push({ path: `${level}/${face}${ty}_${tx}`, buffer: tileBuf });
        }
      }
    }

    // Whole-face fallback for clients without multires WebGL support.
    const fbRes = Math.min(FALLBACK_RES, cubeRes);
    const fallbackBuf = await faceSharp
      .clone()
      .resize(fbRes, fbRes, { kernel: "lanczos3" })
      .jpeg({ quality: TILE_QUALITY, mozjpeg: true })
      .toBuffer();
    tiles.push({ path: `fallback/${face}`, buffer: fallbackBuf });
  }

  return {
    tiles,
    maxLevel,
    cubeRes,
    tileRes: TILE_RES,
    hasWatermark: opts.watermark,
  };
}
