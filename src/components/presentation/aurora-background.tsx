"use client";

/**
 * Aurora background — the client-generic animated theme.
 *
 * Large, heavily-blurred gradient washes drifting very slowly over a
 * deep neutral charcoal. Reads as "modern studio" rather than themed
 * (no stars, no planets), so it works for any client. One wash is
 * tinted with the presentation's accent color (very low alpha) so the
 * motion subtly carries the client's brand; without an accent it stays
 * a cool slate/teal neutral.
 *
 * Pure CSS animation — no canvas, no per-frame JS. Respects
 * prefers-reduced-motion by freezing the drift (the gradients still
 * render, they just hold still).
 */

interface AuroraBackgroundProps {
  /** Client accent color (hex like "#2a6ff3"). Optional — tints one
   *  wash at low alpha. */
  accent?: string | null;
  /** Render within the parent's bounds (position:absolute) instead of
   *  fixed to the viewport — for dividers/splash. */
  inline?: boolean;
}

/** Parse #rgb/#rrggbb to an rgba() string at the given alpha. Falls
 *  back to a neutral slate when the input isn't a parseable hex. */
function hexToRgba(hex: string | null | undefined, alpha: number): string {
  const fallback = `rgba(96, 125, 170, ${alpha})`;
  if (!hex) return fallback;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function AuroraBackground({ accent, inline }: AuroraBackgroundProps) {
  const accentWash = hexToRgba(accent, 0.16);

  return (
    <div
      aria-hidden
      style={{
        position: inline ? "absolute" : "fixed",
        inset: 0,
        overflow: "hidden",
        backgroundColor: "#0a0c10",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Wash 1 — cool slate, upper left, slowest drift */}
      <div
        className="aurora-wash aurora-wash-1"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(82, 110, 158, 0.22) 0%, transparent 60%)",
        }}
      />
      {/* Wash 2 — soft teal, lower right */}
      <div
        className="aurora-wash aurora-wash-2"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(64, 128, 128, 0.16) 0%, transparent 60%)",
        }}
      />
      {/* Wash 3 — client accent (or neutral slate), center, faintest */}
      <div
        className="aurora-wash aurora-wash-3"
        style={{
          background: `radial-gradient(ellipse at center, ${accentWash} 0%, transparent 62%)`,
        }}
      />
      {/* Gentle vignette keeps edges dark so foreground text always
          has contrast regardless of where the washes drift. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(6,7,10,0.55) 100%)",
        }}
      />
      <style>{`
        .aurora-wash {
          position: absolute;
          width: 90vmax;
          height: 90vmax;
          border-radius: 50%;
          filter: blur(60px);
          will-change: transform;
        }
        .aurora-wash-1 {
          top: -30vmax;
          left: -25vmax;
          animation: aurora-drift-1 85s ease-in-out infinite alternate;
        }
        .aurora-wash-2 {
          bottom: -35vmax;
          right: -25vmax;
          animation: aurora-drift-2 70s ease-in-out infinite alternate;
        }
        .aurora-wash-3 {
          top: 10%;
          left: 15%;
          animation: aurora-drift-3 100s ease-in-out infinite alternate;
        }
        @keyframes aurora-drift-1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(14vmax, 10vmax) scale(1.15); }
        }
        @keyframes aurora-drift-2 {
          from { transform: translate(0, 0) scale(1.1); }
          to   { transform: translate(-12vmax, -8vmax) scale(0.95); }
        }
        @keyframes aurora-drift-3 {
          from { transform: translate(0, 0) scale(0.9); }
          to   { transform: translate(10vmax, -6vmax) scale(1.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-wash { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
