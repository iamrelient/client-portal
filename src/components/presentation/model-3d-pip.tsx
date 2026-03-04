"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { Segment } from "./use-scroll-progress";

/* ------------------------------------------------------------------ */
/*  Model3DPiP — floating "back to floor plan" card                    */
/*  Appears when user scrolls past the 3D model into chapter strips    */
/* ------------------------------------------------------------------ */

interface Model3DPiPProps {
  segments: Segment[];
  activeSectionIndex: number;
  onNavigate: (sectionIndex: number) => void;
}

/* ---- Floor plan icon (larger, more detailed) ---- */
function FloorPlanIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      style={{ display: "block" }}
    >
      {/* Outer boundary */}
      <rect
        x="6"
        y="6"
        width="36"
        height="36"
        rx="3"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.5"
      />
      {/* Room dividers */}
      <line
        x1="24" y1="6" x2="24" y2="30"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line
        x1="6" y1="24" x2="24" y2="24"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line
        x1="24" y1="16" x2="42" y2="16"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      <line
        x1="6" y1="34" x2="42" y2="34"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="1"
      />
      {/* Door openings */}
      <line
        x1="14" y1="6" x2="20" y2="6"
        stroke="#060608"
        strokeWidth="2"
      />
      <line
        x1="28" y1="34" x2="36" y2="34"
        stroke="#060608"
        strokeWidth="2"
      />
      {/* Location pin */}
      <circle
        cx="14"
        cy="14"
        r="3"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.2"
      />
      <circle
        cx="14"
        cy="14"
        r="1.2"
        fill="rgba(255,255,255,0.5)"
      />
    </svg>
  );
}

export function Model3DPiP({
  segments,
  activeSectionIndex,
  onNavigate,
}: Model3DPiPProps) {
  const hasAnimatedRef = useRef(false);
  const [animationDone, setAnimationDone] = useState(false);

  /* ---- Find the 3D model segment ---- */
  const model3D = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.kind === "fullscreen" && seg.section.type === "3d-model") {
        return { segmentIndex: i, sectionIndex: seg.sectionIndex, title: seg.section.title };
      }
    }
    return null;
  }, [segments]);

  /* ---- Determine which segment owns the active section ---- */
  const currentSegIndex = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.kind === "fullscreen" && seg.sectionIndex === activeSectionIndex) {
        return i;
      }
      if (
        seg.kind === "chapter" &&
        seg.sections.some((s) => s.sectionIndex === activeSectionIndex)
      ) {
        return i;
      }
    }
    return -1;
  }, [segments, activeSectionIndex]);

  /* ---- Show PiP only when scrolled past the 3D model ---- */
  const showPiP = useMemo(() => {
    if (!model3D) return false;
    if (currentSegIndex === -1) return false;
    return currentSegIndex > model3D.segmentIndex;
  }, [model3D, currentSegIndex]);

  /* ---- Track first appearance for fly-in animation ---- */
  useEffect(() => {
    if (showPiP && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      // After the fly-in animation ends, switch to simpler transition mode
      const timer = setTimeout(() => setAnimationDone(true), 700);
      return () => clearTimeout(timer);
    }
  }, [showPiP]);

  if (!model3D) return null;

  const label = model3D.title || "Floor Plan";

  // First appearance: use fly-in keyframe animation
  // Subsequent toggles: use simpler opacity/transform transition
  const isFirstAppearance = showPiP && !animationDone;
  const isSubsequentShow = showPiP && animationDone;

  return (
    <>
      <div
        data-clickable
        data-cursor-label="Floor Plan"
        onClick={() => onNavigate(model3D.sectionIndex)}
        className={`m3d-pip-card ${isFirstAppearance ? "m3d-pip-fly-in" : ""}`}
        style={{
          position: "fixed",
          zIndex: 45,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "rgba(6,6,8,0.8)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          cursor: "pointer",
          // Only apply transition-based show/hide after first animation
          ...(animationDone
            ? {
                opacity: isSubsequentShow ? 1 : 0,
                pointerEvents: isSubsequentShow ? "auto" as const : "none" as const,
                transform: isSubsequentShow ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
                transition: "opacity 0.35s ease, transform 0.35s ease",
              }
            : !isFirstAppearance
            ? {
                opacity: 0,
                pointerEvents: "none" as const,
              }
            : {
                pointerEvents: "auto" as const,
              }),
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
          e.currentTarget.style.background = "rgba(6,6,8,0.9)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = showPiP ? "translateY(0) scale(1)" : "";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          e.currentTarget.style.background = "rgba(6,6,8,0.8)";
        }}
      >
        <FloorPlanIcon />
        <span className="m3d-pip-label">{label}</span>
      </div>

      <style>{`
        .m3d-pip-card {
          bottom: 80px;
          left: 24px;
          width: 15vw;
          min-width: 140px;
          max-width: 220px;
          aspect-ratio: 1 / 1;
          border-radius: 16px;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .m3d-pip-label {
          font-size: 0.625rem;
          font-weight: 300;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          white-space: nowrap;
        }

        /* Fly-in animation on first appearance */
        .m3d-pip-fly-in {
          animation: m3dPipFlyIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes m3dPipFlyIn {
          from {
            transform: translate(35vw, -35vh) scale(1.3);
            opacity: 0;
          }
          to {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .m3d-pip-card {
            bottom: 16px;
            left: 12px;
            width: 25vw;
            min-width: 100px;
            max-width: 140px;
            border-radius: 12px;
            gap: 4px;
          }
          .m3d-pip-label {
            font-size: 0.5625rem;
          }
        }
        @media (pointer: coarse) {
          .m3d-pip-card {
            min-height: 44px;
          }
        }
      `}</style>
    </>
  );
}
