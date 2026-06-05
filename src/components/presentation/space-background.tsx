"use client";

import { useEffect, useMemo, useRef } from "react";

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
  /** When provided, the starfield reacts to this element's scroll
   *  velocity with a "lightspeed" vertical streak — stars elongate
   *  and brighten while scrolling, snap back when it stops. Pass the
   *  presentation's scroll container. Omit for a static (twinkle-
   *  only) field, e.g. on the loading splash. */
  scrollContainer?: React.RefObject<HTMLElement | null>;
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

/** Build a box-shadow string of N stars spread in a `size × size`
 *  canvas *centered on the origin* (coords in [-size/2, +size/2]).
 *  Centering matters: the layer's anchor sits at the viewport
 *  center, so a scaleY warp stretches stars symmetrically out from
 *  the middle of the screen — the classic hyperspace look. */
function buildStarShadows(
  count: number,
  size: number,
  seed: number,
  color: string
): string {
  const rand = seededRandom(seed);
  const half = size / 2;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * size - half);
    const y = Math.round(rand() * size - half);
    parts.push(`${x}px ${y}px ${color}`);
  }
  return parts.join(", ");
}

export function SpaceBackground({
  variant = "subtle",
  seed = 42,
  inline = false,
  scrollContainer,
}: SpaceBackgroundProps) {
  const stars = useMemo(() => {
    const density = variant === "rich" ? 1.8 : 1.4;
    const SIZE = 2400;
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

  // Refs to the three star-layer anchors so the warp loop can write
  // transforms straight to the DOM (no React re-render per frame).
  const layer1 = useRef<HTMLDivElement>(null);
  const layer2 = useRef<HTMLDivElement>(null);
  const layer3 = useRef<HTMLDivElement>(null);

  // ── Scroll-velocity "lightspeed" warp ──
  useEffect(() => {
    if (!scrollContainer) return;
    if (typeof window !== "undefined") {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mql.matches) return; // honor reduced-motion: no warp
    }

    const layers = [layer1.current, layer2.current, layer3.current];
    // Per-layer parallax weight — nearer (bright) stars streak more
    // than distant (small) ones, which sells depth during the warp.
    const weights = [0.7, 1, 1.5];

    let raf = 0;
    let running = true;
    let lastScroll =
      scrollContainer.current?.scrollTop ?? window.scrollY ?? 0;
    let velocity = 0;

    const tick = () => {
      if (!running) return;
      const cur = scrollContainer.current?.scrollTop ?? window.scrollY ?? 0;
      const delta = cur - lastScroll;
      lastScroll = cur;

      // Smooth the raw per-frame delta into a decaying velocity so
      // the streak trails off naturally after the user stops.
      velocity = velocity * 0.82 + Math.abs(delta) * 0.18;

      // Normalize: ~70 px/frame of scroll = full warp. Capped at 1.
      const v = Math.min(velocity / 70, 1);

      layers.forEach((el, i) => {
        if (!el) return;
        if (v < 0.004) {
          // Idle — clear transforms so the twinkle reads cleanly.
          el.style.transform = "translate(-50%, -50%) scaleY(1)";
          el.style.filter = "none";
          return;
        }
        const w = weights[i];
        const stretch = 1 + v * 16 * w; // up to ~17–25x at full warp
        const blur = v * 1.4 * w;
        const bright = 1 + v * 0.6;
        el.style.transform = `translate(-50%, -50%) scaleY(${stretch})`;
        el.style.filter = `blur(${blur}px) brightness(${bright})`;
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [scrollContainer]);

  // Shared base style for the three centered star anchors. They sit
  // at the viewport center; box-shadows (centered coords) spread the
  // stars out around them. transform keeps the translate(-50%,-50%)
  // centering so the warp's scaleY happens around screen center.
  const anchorBase: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%) scaleY(1)",
    background: "transparent",
    borderRadius: "50%",
    willChange: "transform, filter",
  };

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
        ref={layer1}
        className="space-bg-stars-small"
        style={{ ...anchorBase, width: 1, height: 1, boxShadow: stars.small }}
      />
      <div
        ref={layer2}
        className="space-bg-stars-medium"
        style={{ ...anchorBase, width: 2, height: 2, boxShadow: stars.medium }}
      />
      <div
        ref={layer3}
        className="space-bg-stars-bright"
        style={{ ...anchorBase, width: 3, height: 3, boxShadow: stars.bright }}
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
            opacity: 0.85;
          }
        }
      `}</style>
    </div>
  );
}
