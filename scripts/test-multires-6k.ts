import sharp from "sharp";
import { buildMultiresPyramid } from "../src/lib/multires";

async function main() {
  const W = 6144, H = 3072;
  // Gradient synthetic (cheap to build, realistic dimensions)
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      px[o] = (x / W) * 255; px[o + 1] = (y / H) * 255; px[o + 2] = 128;
    }
  const jpeg = await sharp(px, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 90 }).toBuffer();
  console.log("input jpeg KB:", Math.round(jpeg.length / 1024));
  const t0 = Date.now();
  const pyr = await buildMultiresPyramid(jpeg, "image/jpeg", { watermark: false });
  if (!pyr) throw new Error("null");
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const total = pyr.tiles.reduce((s, t) => s + t.buffer.length, 0);
  const lv = new Map<string, number>();
  for (const t of pyr.tiles) {
    const k = t.path.split("/")[0];
    lv.set(k, (lv.get(k) || 0) + 1);
  }
  console.log(`cubeRes=${pyr.cubeRes} maxLevel=${pyr.maxLevel} tiles=${pyr.tiles.length} totalMB=${(total/1048576).toFixed(1)} in ${secs}s`);
  console.log("tiles per level:", Object.fromEntries(lv));
  // Expect cubeRes 1952, maxLevel 3, level3 16/face, level2 4/face, level1 1/face
}
main().catch((e) => { console.error(e); process.exit(1); });
