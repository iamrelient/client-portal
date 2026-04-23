"use client";

import { useEffect, useRef, useState } from "react";

/** Supported ambient backdrops for a divider slide. Random picks a
 *  different one on each viewer load so the same presentation feels
 *  a little fresh across visits. */
export type AmbientStyle =
  | "grid"
  | "particles"
  | "line-pulse"
  | "gradient-shift";

const ALL_STYLES: AmbientStyle[] = [
  "grid",
  "particles",
  "line-pulse",
  "gradient-shift",
];

function pickStyle(
  configured: string | null | undefined,
  fallbackSeed: string
): AmbientStyle {
  if (configured && (ALL_STYLES as string[]).includes(configured)) {
    return configured as AmbientStyle;
  }
  // Deterministic per-section fallback — same section picks the same style
  // on every render so the divider doesn't flicker if it remounts.
  let hash = 0;
  for (let i = 0; i < fallbackSeed.length; i++) {
    hash = (hash * 31 + fallbackSeed.charCodeAt(i)) | 0;
  }
  return ALL_STYLES[Math.abs(hash) % ALL_STYLES.length];
}

interface SectionDividerProps {
  section: {
    id: string;
    title: string | null;
    description: string | null;
    metadata: Record<string, unknown> | null;
  };
  /** Hex color, optional. Used as a subtle hue for the "gradient-shift"
   *  and "line-pulse" ambient styles so a presentation's branded accent
   *  shows through. */
  accentColor?: string | null;
}

/** Full-screen divider / title slide with an animated backdrop. Renders
 *  as its own segment — the viewer scrolls into it like any other section,
 *  scrolls out of it to reach what's next. Replaces the older "text"
 *  section concept: the divider now carries title + description and
 *  always sits on a branded backdrop. */
export function SectionDivider({ section, accentColor }: SectionDividerProps) {
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ambient = pickStyle(
    (section.metadata as Record<string, string> | null)?.ambientStyle,
    section.id
  );
  const accent = accentColor || "#2a6ff3";

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        backgroundColor: "#060608",
        color: "#f5f5f7",
      }}
    >
      {/* Ambient backdrop */}
      <AmbientBackdrop style={ambient} accent={accent} reduced={reduced} />

      {/* Vignette so the text always has contrast regardless of backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(6,6,8,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem clamp(1.5rem, 5vw, 4rem)",
          textAlign: "center",
        }}
      >
        {section.title && (
          <h2
            style={{
              fontSize: "clamp(1.75rem, 5vw, 4rem)",
              fontWeight: 300,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              lineHeight: 1.1,
              color: "#fff",
              textShadow: "0 2px 20px rgba(0,0,0,0.35)",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(12px)",
              transition: reduced
                ? "none"
                : "opacity 1s cubic-bezier(0.25,0.1,0.25,1), transform 1s cubic-bezier(0.25,0.1,0.25,1)",
            }}
          >
            {section.title}
          </h2>
        )}
        {section.description && (
          <p
            style={{
              marginTop: "1.25rem",
              maxWidth: 640,
              fontSize: "clamp(0.95rem, 1.3vw, 1.125rem)",
              fontWeight: 300,
              lineHeight: 1.7,
              color: "rgba(245,245,247,0.8)",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(12px)",
              transition: reduced
                ? "none"
                : "opacity 1s cubic-bezier(0.25,0.1,0.25,1) 0.18s, transform 1s cubic-bezier(0.25,0.1,0.25,1) 0.18s",
            }}
          >
            {section.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ambient backdrops                                                  */
/* ------------------------------------------------------------------ */

function AmbientBackdrop({
  style,
  accent,
  reduced,
}: {
  style: AmbientStyle;
  accent: string;
  reduced: boolean;
}) {
  if (style === "grid") return <AmbientGrid accent={accent} reduced={reduced} />;
  if (style === "particles")
    return <AmbientParticles accent={accent} reduced={reduced} />;
  if (style === "line-pulse")
    return <AmbientLinePulse accent={accent} reduced={reduced} />;
  return <AmbientGradientShift accent={accent} reduced={reduced} />;
}

/** Subtle grid that drifts slowly. */
function AmbientGrid({ accent, reduced }: { accent: string; reduced: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* Base gradient wash behind the grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 35%, ${hexToRgba(accent, 0.18)} 0%, transparent 60%)`,
        }}
      />
      {/* The grid itself */}
      <div
        style={{
          position: "absolute",
          inset: "-50%",
          backgroundImage: [
            "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "64px 64px",
          animation: reduced ? undefined : "pres-divider-grid-drift 40s linear infinite",
        }}
      />
      <style>{`
        @keyframes pres-divider-grid-drift {
          from { transform: translate(0, 0); }
          to   { transform: translate(64px, 64px); }
        }
      `}</style>
    </div>
  );
}

/** Slow-drifting small dots on a dark base. */
function AmbientParticles({ accent, reduced }: { accent: string; reduced: boolean }) {
  // Pre-position a handful of dots; CSS animates them drifting.
  const dots = Array.from({ length: 36 }, (_, i) => {
    const seed = i * 9301 + 49297;
    const x = (seed % 100) + (seed % 7) * 0.1;
    const y = ((seed * 7) % 100) + (seed % 11) * 0.1;
    const size = 1.5 + ((seed * 13) % 30) / 10;
    const delay = (seed % 60) / 10;
    const dur = 14 + ((seed * 3) % 90) / 10;
    return { x, y, size, delay, dur, i };
  });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, ${hexToRgba(accent, 0.15)} 0%, transparent 70%)`,
        }}
      />
      {dots.map((d) => (
        <span
          key={d.i}
          style={{
            position: "absolute",
            left: `${d.x % 100}%`,
            top: `${d.y % 100}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.55)",
            boxShadow: `0 0 ${d.size * 3}px ${hexToRgba(accent, 0.35)}`,
            animation: reduced
              ? undefined
              : `pres-divider-particle-float ${d.dur}s ease-in-out ${d.delay}s infinite`,
            opacity: 0.6,
          }}
        />
      ))}
      <style>{`
        @keyframes pres-divider-particle-float {
          0%   { transform: translateY(0) translateX(0); opacity: 0.2; }
          50%  { transform: translateY(-16px) translateX(8px); opacity: 0.9; }
          100% { transform: translateY(0) translateX(0); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

/** Thin accent lines pulsing outward from the horizontal centerline. */
function AmbientLinePulse({ accent, reduced }: { accent: string; reduced: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${hexToRgba(accent, 0.08)} 0%, transparent 40%, transparent 60%, ${hexToRgba(accent, 0.08)} 100%)`,
        }}
      />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: "-20%",
            right: "-20%",
            top: `${50 + (i - 1.5) * 2}%`,
            height: "1px",
            background: `linear-gradient(90deg, transparent, ${hexToRgba(accent, 0.9)} 50%, transparent)`,
            opacity: 0,
            animation: reduced
              ? undefined
              : `pres-divider-line-pulse 4.5s ease-out ${i * 0.55}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pres-divider-line-pulse {
          0%   { opacity: 0; transform: scaleX(0.3); }
          40%  { opacity: 0.9; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

/** Smoothly shifting gradient around the accent hue. */
function AmbientGradientShift({ accent, reduced }: { accent: string; reduced: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-30%",
          background: `conic-gradient(from 0deg at 50% 50%, ${hexToRgba(accent, 0.35)}, rgba(20,20,30,0.9), ${hexToRgba(accent, 0.25)}, rgba(6,6,8,1), ${hexToRgba(accent, 0.35)})`,
          filter: "blur(80px)",
          animation: reduced ? undefined : "pres-divider-gradient-spin 28s linear infinite",
        }}
      />
      <style>{`
        @keyframes pres-divider-gradient-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 3 && clean.length !== 6) return `rgba(42, 111, 243, ${alpha})`;
  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(42, 111, 243, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
