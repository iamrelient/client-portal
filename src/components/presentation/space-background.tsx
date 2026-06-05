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
      // Dedicated "sparkle" layer — fewer, larger stars that flash
      // hard (near-invisible → full bright + glow) so the field
      // visibly twinkles rather than just gently breathing.
      sparkle: buildStarShadows(
        Math.round(22 * density),
        SIZE,
        seed + 4,
        "rgba(255,255,255,1)"
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
      {/* Sparkle layer — dramatic flashing on top */}
      <div
        className="space-bg-stars-sparkle"
        style={{
          position: "absolute",
          width: 2,
          height: 2,
          top: 0,
          left: 0,
          background: "transparent",
          borderRadius: "50%",
          boxShadow: stars.sparkle,
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
        /* Faster cycles + wider opacity swings than before so the
           field visibly twinkles rather than gently breathing. */
        .space-bg-stars-small {
          animation: space-twinkle-1 3.2s ease-in-out infinite;
        }
        .space-bg-stars-medium {
          animation: space-twinkle-2 2.4s ease-in-out infinite;
        }
        .space-bg-stars-bright {
          animation: space-twinkle-3 1.8s ease-in-out infinite;
        }
        .space-bg-stars-sparkle {
          animation: space-sparkle 2.6s steps(1, end) infinite;
        }
        @keyframes space-twinkle-1 {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        @keyframes space-twinkle-2 {
          0%, 100% { opacity: 0.55; }
          35% { opacity: 1; }
          70% { opacity: 0.7; }
        }
        @keyframes space-twinkle-3 {
          0%, 100% { opacity: 0.5; }
          40% { opacity: 1; }
        }
        /* Hard flash — most sparkle stars sit dim, then a brief
           full-bright pop with a glow, staggered by the steps()
           timing so they don't all flash together. */
        @keyframes space-sparkle {
          0%, 100% { opacity: 0.15; filter: none; }
          45% { opacity: 0.2; filter: none; }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 3px rgba(255,255,255,0.9));
          }
          55% { opacity: 0.2; filter: none; }
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
          .space-bg-stars-bright,
          .space-bg-stars-sparkle {
            animation: none;
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
