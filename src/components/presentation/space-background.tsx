"use client";

import { useMemo } from "react";

interface SpaceBackgroundProps {
  /** Visual intensity. "subtle" is what we use for the deck
   *  background (the panels between slides shouldn't fight the
   *  content); "rich" turns up the planets / stars for a divider
   *  hero treatment. */
  variant?: "subtle" | "rich";
  /** Optional seed so two SpaceBackgrounds on the same page draw
   *  distinct star patterns (e.g. deck background + a divider's
   *  background). Same seed = same pattern, so re-renders don't
   *  reshuffle the sky beneath the user. */
  seed?: number;
  /** When true, render absolutely-positioned inside the parent.
   *  When false (default), render position: fixed covering the
   *  viewport — the right choice for the deck background. */
  inline?: boolean;
}

/** Deterministic, seedable PRNG — a tiny LCG. Same seed always
 *  produces the same sequence, so star fields stay put across
 *  re-renders. Plain Math.random would jitter the sky on every
 *  render of a parent and look terrible. */
function seededRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a CSS `box-shadow` string with N tiny "stars" at random
 *  positions inside a virtual `size × size` canvas. The element
 *  the shadow is attached to is 1×1 px; the shadows do all the
 *  visual work. This trick avoids creating N DOM nodes — one node
 *  paints hundreds of stars with no layout cost.
 *
 *  The shadow grid tiles to fill the viewport via the parent's
 *  background-size + repeat, since shadows themselves don't tile.
 *  Instead we just pick a big enough canvas (default 2000 px) that
 *  most screens are covered; the slight repetition isn't visible. */
function buildStarShadows(
  count: number,
  size: number,
  seed: number,
  color: string
): string {
  const rand = seededRandom(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * size);
    const y = Math.round(rand() * size);
    parts.push(`${x}px ${y}px ${color}`);
  }
  return parts.join(", ");
}

/** Animated space-themed background — starfield + slow-drifting
 *  distant planets. Pure CSS, no JS in the render path beyond
 *  the one-shot shadow string build, so even rich variants don't
 *  cost the main thread anything once mounted.
 *
 *  Layers, painted back-to-front:
 *    1. Deep navy gradient base (the void).
 *    2. Three star layers at different sizes / twinkle phases for
 *       parallax depth.
 *    3. One or two planets — large radial gradients positioned off
 *       the edges, drifting on a 60–90 s loop.
 *    4. Soft vignette so corners don't look flat. */
export function SpaceBackground({
  variant = "subtle",
  seed = 42,
  inline = false,
}: SpaceBackgroundProps) {
  // Star shadow strings — memoized so they only build once per
  // (seed, density) tuple, not on every render of the parent.
  const stars = useMemo(() => {
    // Denser fields than before so the sky reads as obviously
    // starry rather than a faint sprinkle, especially behind the
    // translucent carousel scrim.
    const density = variant === "rich" ? 1.8 : 1.4;
    return {
      small: buildStarShadows(
        Math.round(240 * density),
        2000,
        seed + 1,
        "rgba(255,255,255,0.95)"
      ),
      medium: buildStarShadows(
        Math.round(95 * density),
        2000,
        seed + 2,
        "rgba(255,255,255,1)"
      ),
      bright: buildStarShadows(
        Math.round(30 * density),
        2000,
        seed + 3,
        "rgba(220,235,255,1)"
      ),
    };
  }, [variant, seed]);

  const planetIntensity = variant === "rich" ? 1 : 0.7;

  return (
    <div
      aria-hidden
      style={{
        position: inline ? "absolute" : "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden",
        // Deep-space gradient. Slightly desaturated so it doesn't
        // fight the content overlaying it.
        background:
          "radial-gradient(ellipse at 60% 40%, #1a1f3a 0%, #0a0d1f 45%, #050714 100%)",
      }}
    >
      {/* Star layers */}
      <div
        className="space-bg-stars-small"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          top: 0,
          left: 0,
          background: "transparent",
          boxShadow: stars.small,
        }}
      />
      <div
        className="space-bg-stars-medium"
        style={{
          position: "absolute",
          width: 2,
          height: 2,
          top: 0,
          left: 0,
          background: "transparent",
          borderRadius: "50%",
          boxShadow: stars.medium,
        }}
      />
      <div
        className="space-bg-stars-bright"
        style={{
          position: "absolute",
          width: 3,
          height: 3,
          top: 0,
          left: 0,
          background: "transparent",
          borderRadius: "50%",
          boxShadow: stars.bright,
        }}
      />

      {/* Planet 1 — large, off-edge */}
      <div
        style={{
          position: "absolute",
          width: variant === "rich" ? 720 : 540,
          height: variant === "rich" ? 720 : 540,
          right: "-220px",
          bottom: "-260px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%, rgba(120,140,200," +
            String(0.18 * planetIntensity) +
            ") 0%, rgba(70,90,180," +
            String(0.08 * planetIntensity) +
            ") 45%, transparent 75%)",
          filter: "blur(2px)",
          animation: "space-planet-drift-1 90s ease-in-out infinite",
        }}
      />
      {/* Planet 2 — smaller, opposite side */}
      <div
        style={{
          position: "absolute",
          width: variant === "rich" ? 480 : 360,
          height: variant === "rich" ? 480 : 360,
          left: "-160px",
          top: "-180px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 60% 40%, rgba(180,140,200," +
            String(0.14 * planetIntensity) +
            ") 0%, rgba(100,80,160," +
            String(0.06 * planetIntensity) +
            ") 50%, transparent 78%)",
          filter: "blur(2px)",
          animation: "space-planet-drift-2 75s ease-in-out infinite",
        }}
      />

      {/* Soft vignette to deepen the corners */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)",
        }}
      />

      <style>{`
        .space-bg-stars-small {
          animation: space-twinkle-1 7s ease-in-out infinite;
        }
        .space-bg-stars-medium {
          animation: space-twinkle-2 5s ease-in-out infinite;
        }
        .space-bg-stars-bright {
          animation: space-twinkle-3 3.5s ease-in-out infinite;
        }
        @keyframes space-twinkle-1 {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }
        @keyframes space-twinkle-2 {
          0%, 100% { opacity: 0.7; }
          40% { opacity: 1; }
          70% { opacity: 0.82; }
        }
        @keyframes space-twinkle-3 {
          0%, 100% { opacity: 0.85; }
          25% { opacity: 0.6; }
          55% { opacity: 1; }
        }
        @keyframes space-planet-drift-1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, -20px); }
        }
        @keyframes space-planet-drift-2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 30px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .space-bg-stars-small,
          .space-bg-stars-medium,
          .space-bg-stars-bright {
            animation: none;
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
