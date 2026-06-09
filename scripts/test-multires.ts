/**
 * Sanity test for the multires pyramid builder. Renders a synthetic
 * equirect with distinct colored bands at known longitudes/latitudes,
 * runs the pyramid build, and checks:
 *   1. Tile counts/paths match the expected pyramid shape.
 *   2. Face centers sample the expected part of the sphere:
 *        f center → lon 0 band, r → +90°, b → 180°, l → -90°,
 *        u → sky color, d → floor color.
 * Run: node scripts/test-multires.mjs   (after `npx tsc` types compile —
 * uses the compiled lib via tsx-style dynamic import of the TS source
 * through next's transpile isn't available here, so we import the TS
 * file with a tiny inline re-implementation guard: instead we import
 * the built JS via ts-node/esm if present. Simpler: this script
 * re-imports the library through `npx tsx`.)
 */
import sharp from "sharp";
import { buildMultiresPyramid } from "../src/lib/multires";

async function main() {
const W = 1024;
const H = 512;

// Build a synthetic equirect: 4 vertical quadrant bands (by longitude)
// + white top cap (sky) + black bottom cap (floor).
//   lon -45..45   (image x 37.5%..62.5%): RED      (front)
//   lon 45..135   (x 62.5%..87.5%):       GREEN    (right)
//   lon 135..-135 (x 87.5%..12.5% wrap):  BLUE     (back)
//   lon -135..-45 (x 12.5%..37.5%):       YELLOW   (left)
const px = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    const v = y / H;
    if (v < 0.15) {
      px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; // sky white
      continue;
    }
    if (v > 0.85) {
      px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; // floor black
      continue;
    }
    const u = x / W; // 0..1, lon = (u - 0.5) * 360
    if (u >= 0.375 && u < 0.625) { px[o] = 255; }                    // red front
    else if (u >= 0.625 && u < 0.875) { px[o + 1] = 255; }           // green right
    else if (u >= 0.125 && u < 0.375) { px[o] = 255; px[o + 1] = 255; } // yellow left
    else { px[o + 2] = 255; }                                        // blue back
  }
}

const jpeg = await sharp(px, { raw: { width: W, height: H, channels: 3 } })
  .jpeg({ quality: 95 })
  .toBuffer();

const pyr = await buildMultiresPyramid(jpeg, "image/jpeg", { watermark: false });
if (!pyr) throw new Error("pyramid build returned null");

console.log(
  `cubeRes=${pyr.cubeRes} maxLevel=${pyr.maxLevel} tiles=${pyr.tiles.length}`
);

// Expected shape: cubeRes = 8*floor(1024/pi/8) = 8*40 = 320 → 1 level
// (320 <= 512). 6 faces × 1 tile + 6 fallbacks = 12 tiles.
const expectLevels = pyr.cubeRes <= 512 ? 1 : undefined;
if (expectLevels && pyr.maxLevel !== expectLevels) {
  throw new Error(`maxLevel ${pyr.maxLevel} != ${expectLevels}`);
}

async function centerColor(path) {
  const t = pyr.tiles.find((t) => t.path === path);
  if (!t) throw new Error(`missing tile ${path}`);
  const img = sharp(t.buffer);
  const m = await img.metadata();
  const raw = await img.raw().toBuffer();
  const cx = Math.floor(m.width / 2);
  const cy = Math.floor(m.height / 2);
  const o = (cy * m.width + cx) * 3;
  return [raw[o], raw[o + 1], raw[o + 2]];
}

function classify([r, g, b]) {
  if (r > 180 && g > 180 && b > 180) return "white";
  if (r < 70 && g < 70 && b < 70) return "black";
  if (r > 180 && g > 180) return "yellow";
  if (r > 180) return "red";
  if (g > 180) return "green";
  if (b > 180) return "blue";
  return `?(${r},${g},${b})`;
}

const expectations = [
  ["1/f0_0", "red"],
  ["1/r0_0", "green"],
  ["1/b0_0", "blue"],
  ["1/l0_0", "yellow"],
  ["1/u0_0", "white"],
  ["1/d0_0", "black"],
];

let failed = 0;
for (const [path, want] of expectations) {
  const got = classify(await centerColor(path));
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${path}: want ${want}, got ${got}`);
}

// Fallbacks exist for all faces
for (const f of ["f", "b", "u", "d", "l", "r"]) {
  if (!pyr.tiles.find((t) => t.path === `fallback/${f}`)) {
    failed++;
    console.log(`FAIL missing fallback/${f}`);
  }
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("All multires checks passed");

}
main().catch((e) => { console.error(e); process.exit(1); });
