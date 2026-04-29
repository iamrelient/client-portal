/**
 * Generate a pre-warped floor watermark PNG that, when composited onto the
 * bottom-center of an equirectangular 360° panorama, appears flat on the
 * floor of the rendered sphere.
 *
 * Run once:
 *   npx tsx scripts/generate-floor-watermark.ts
 *
 * Source: public/logo-horizontal.png
 * Output: public/floor-watermark.png
 *
 * The math:
 *   An equirectangular image maps (u, v) → (longitude, latitude) where
 *     longitude = (u / W) * 2π        (-π .. π around the room)
 *     latitude  = (v / H) * π          (0 = north pole, π = south pole)
 *
 *   We want a flat logo lying on the floor a distance r₀ in front of the
 *   camera. For each output pixel (u_out, v_out) in our overlay strip
 *   (centered at the bottom of the panorama), we figure out which point on
 *   the floor that pixel sees, then sample the source logo at that point.
 *
 *   • The overlay covers a horizontal arc of ±θ_max from the panorama's
 *     forward direction, and a vertical band of latitudes from φ_top to π.
 *   • A ray at (θ, φ) hits the floor (y = -h, where h = camera height) at:
 *         x = h · tan(π - φ) · sin(θ)
 *         z = h · tan(π - φ) · cos(θ)
 *     (z is "depth", positive going away from camera)
 *   • That (x, z) is mapped to the logo's (u_logo, v_logo) by treating the
 *     logo as a flat texture of width W_logo_world centered at distance
 *     z₀ in front of the camera.
 *
 * The result is a wide arc-shaped image that stretches from edge to edge
 * of the panorama at the very bottom and pinches to its true logo width
 * higher up. When the user looks down in the rendered sphere, the logo
 * reads flat on the floor.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

// ── Tunables ────────────────────────────────────────────────────────────
const SOURCE_LOGO = path.join(process.cwd(), "public", "logo-horizontal.png");
const OUTPUT = path.join(process.cwd(), "public", "floor-watermark.png");

/** Final overlay size, in equirectangular pixels. The watermark composites
 *  onto a panorama at this exact size — pick something that scales well to
 *  typical 4K (4096×2048) and 8K (8192×4096) panoramas. We aim for ~25% of
 *  a 4K width. The asset route picks a smaller scale at composite time. */
const OUT_W = 1024;
const OUT_H = 256;

/** Where on the floor the logo lives, in metres. Camera at origin, eye at
 *  height h, looking along +z. The logo's center sits at (0, -h, z0).
 *  These pick a "comfortable, embossed-on-the-floor" feel. */
const CAMERA_HEIGHT = 1.6;     // metres
const LOGO_FORWARD = 1.6;      // metres in front of the camera
const LOGO_HALF_WIDTH = 1.0;   // half the world-space width of the logo
const LOGO_HALF_DEPTH = 0.25;  // half the world-space depth of the logo (front-to-back on floor)

/** Latitude range covered by the overlay strip (radians from the equator).
 *  φ_top should be < π. We carve the bottom strip of an equirectangular —
 *  the slice from φ_top down to (just shy of) the south pole. */
const PHI_TOP = Math.PI * 0.78;     // ~140° from north pole
const PHI_BOTTOM = Math.PI * 0.995; // stop just before the singular south pole

// ────────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(SOURCE_LOGO)) {
    throw new Error(`Source logo missing at ${SOURCE_LOGO}`);
  }

  // Load the logo as raw RGBA so we can sample it pixel-by-pixel.
  const logo = sharp(SOURCE_LOGO).ensureAlpha();
  const logoMeta = await logo.metadata();
  if (!logoMeta.width || !logoMeta.height) {
    throw new Error("Could not read logo dimensions");
  }
  const lw = logoMeta.width;
  const lh = logoMeta.height;
  const logoRaw = await logo.raw().toBuffer();

  // Output buffer (RGBA).
  const out = Buffer.alloc(OUT_W * OUT_H * 4);

  // For each output pixel, compute the floor-space point it sees and sample
  // the logo accordingly.
  for (let yo = 0; yo < OUT_H; yo++) {
    // Map yo (0 at top of overlay, OUT_H at bottom) to latitude.
    const t = yo / (OUT_H - 1);
    const phi = PHI_TOP + t * (PHI_BOTTOM - PHI_TOP);
    // Angle from straight down (the south pole is "looking down").
    const downAngle = Math.PI - phi;
    // Distance along the floor from straight-below-the-camera.
    const r = CAMERA_HEIGHT * Math.tan(downAngle);

    for (let xo = 0; xo < OUT_W; xo++) {
      // Map xo (0..OUT_W) to longitude offset around the panorama.
      // The overlay wraps around the full bottom strip (full 2π). We center
      // the logo at θ = 0 (forward).
      const u = xo / OUT_W;
      let theta = (u - 0.5) * 2 * Math.PI; // -π .. π
      // Make sure theta stays in [-π, π].
      if (theta > Math.PI) theta -= 2 * Math.PI;
      if (theta < -Math.PI) theta += 2 * Math.PI;

      // Floor coords (camera-relative): +z is forward, +x is right.
      const fx = r * Math.sin(theta);
      const fz = r * Math.cos(theta);

      // Translate to logo-local coords. Logo is centered at (0, -h, LOGO_FORWARD).
      const lx = fx;                  // logo's local x = world x
      const lz = fz - LOGO_FORWARD;   // logo's local z = world z - LOGO_FORWARD

      // Inside the logo's world-space rectangle?
      if (Math.abs(lx) > LOGO_HALF_WIDTH || Math.abs(lz) > LOGO_HALF_DEPTH) {
        // outside the logo footprint → transparent
        const idx = (yo * OUT_W + xo) * 4;
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = 0;
        continue;
      }

      // Map (lx, lz) into source logo image UV.
      // u runs left→right with x; v runs top→bottom with -z (so the
      // far edge of the logo (most distant from camera) renders at the
      // top of the source image).
      const lu = (lx / LOGO_HALF_WIDTH) * 0.5 + 0.5; // 0..1
      const lv = (-lz / LOGO_HALF_DEPTH) * 0.5 + 0.5; // 0..1

      const sx = Math.min(lw - 1, Math.max(0, Math.round(lu * (lw - 1))));
      const sy = Math.min(lh - 1, Math.max(0, Math.round(lv * (lh - 1))));
      const sidx = (sy * lw + sx) * 4;

      const idx = (yo * OUT_W + xo) * 4;
      out[idx] = logoRaw[sidx];         // R
      out[idx + 1] = logoRaw[sidx + 1]; // G
      out[idx + 2] = logoRaw[sidx + 2]; // B
      out[idx + 3] = logoRaw[sidx + 3]; // A
    }
  }

  await sharp(out, {
    raw: { width: OUT_W, height: OUT_H, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT);

  console.log(
    `Wrote ${OUTPUT} (${OUT_W}×${OUT_H}). Composite at horizontal-center, ` +
      `vertical-bottom of an equirectangular panorama for a flat-on-floor logo.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
