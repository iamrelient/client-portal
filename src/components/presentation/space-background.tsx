"use client";

import { useMemo } from "react";

interface SpaceBackgroundProps {
  /** Visual intensity. "subtle" for the deck background (panels
   *  between slides shouldn't fight content); "rich" turns up the
   *  planets / stars for a divider hero or the loading splash. */
  variant?: "subtle" | "rich";
  /** Seed so two backgrounds on one page draw distinct skies.
   *  Same seed = same pattern (stable across re-renders). */
  seed?: number;
  /** Absolute inside the parent (true) vs fixed to the viewport
   *  (false, default — the right choice for the deck background). */
  inline?: boolean;
}

/** Deterministic seedable PRNG (tiny LCG) — keeps star fields put
 *  across re-renders instead of reshuffling on every parent render. */
function seededRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Build a box-shadow string of N stars spread across a
 *  `size × size` canvas. One 1-3px element paints all N stars via
 *  box-shadow offsets — no per-star DOM nodes, zero layout cost. */
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

export function SpaceBackground({
  variant = "subtle",
  seed = 42,
  inline = false,
}: SpaceBackgroundProps) {
  const stars = useMemo(() => {
    const density = variant === "rich" ? 1.8 : 1.4;
    const SIZE = 2000;
    return {
      small: buildStarShadows(
        Math.round(240 * density),
        SIZE,
        seed + 1,
        "rgba(255,255,255,0.95)"
      ),
      medium: buildStarShadows(
        Math.round(95 * density),
        SIZE,
        seed + 2,
        "rgba(255,255,255,1)"
      ),
      bright: buildStarShadows(
        Math.round(30 * density),
        SIZE,
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
        /* Each layer combines TWO animations: a slow smooth opacity
           fade (gentle ease-in-out, no hard flashes), and an even
           slower drift (subtle translate) so the whole field glides
           — like a slowly turning sky. Different durations per layer
           keep them from syncing, and the staggered drift directions
           add depth. Long cycles = calm, not busy. */
        .space-bg-stars-small {
          animation: space-fade-1 9s ease-in-out infinite,
            space-drift-1 140s ease-in-out infinite;
        }
        .space-bg-stars-medium {
          animation: space-fade-2 12s ease-in-out infinite,
            space-drift-2 110s ease-in-out infinite;
        }
        .space-bg-stars-bright {
          animation: space-fade-3 15s ease-in-out infinite,
            space-drift-3 170s ease-in-out infinite;
        }
        /* Smooth fades — wide but gentle, always eased so a star
           glides between dim and bright instead of blinking. */
        @keyframes space-fade-1 {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.9; }
        }
        @keyframes space-fade-2 {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes space-fade-3 {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.95; }
        }
        /* Subtle fluid drift — small translate so stars never leave
           gaps; opposed directions per layer for parallax depth. */
        @keyframes space-drift-1 {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(-28px, 18px); }
        }
        @keyframes space-drift-2 {
          0%, 100% { transform: translate(0px, 0px); }
          50% { transform: translate(22px, -16px); }
        }
        @keyframes space-drift-3 {
          0%, 100% { transform: translate(0px, 0px); }
          33% { transform: translate(16px, 20px); }
          66% { transform: translate(-18px, 10px); }
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
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
