"use client";

import { useMemo } from "react";
import type { Segment } from "./use-scroll-progress";

/* ------------------------------------------------------------------ */
/*  Model3DPiP — floating "back to floor plan" widget                  */
/*  Appears when user scrolls past the 3D model into chapter strips    */
/* ------------------------------------------------------------------ */

interface Model3DPiPProps {
  segments: Segment[];
  activeSectionIndex: number;
  onNavigate: (sectionIndex: number) => void;
}

/* ---- Floor plan icon (isometric cube) ---- */
function FloorPlanIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      style={{ display: "block" }}
    >
      {/* Isometric floor plan icon */}
      <rect
        x="3"
        y="3"
        width="14"
        height="14"
        rx="1.5"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.2"
      />
      {/* Room dividers */}
      <line
        x1="10" y1="3" x2="10" y2="12"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      <line
        x1="3" y1="10" x2="10" y2="10"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      <line
        x1="10" y1="7" x2="17" y2="7"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
      />
      {/* Location pin dot */}
      <circle
        cx="6.5"
        cy="6.5"
        r="1.5"
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

  if (!model3D) return null;

  const label = model3D.title || "Floor Plan";

  return (
    <>
      <div
        data-clickable
        data-cursor-label="Floor Plan"
        onClick={() => onNavigate(model3D.sectionIndex)}
        className="m3d-pip-widget"
        style={{
          position: "fixed",
          zIndex: 45,
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(6,6,8,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          cursor: "pointer",
          opacity: showPiP ? 1 : 0,
          pointerEvents: showPiP ? "auto" : "none",
          transform: showPiP ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(6,6,8,0.9)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(6,6,8,0.75)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
      >
        <FloorPlanIcon />
        <span className="m3d-pip-label">
          {label}
        </span>
      </div>
      <style>{`
        .m3d-pip-widget {
          bottom: 80px;
          left: 24px;
          padding: 10px 16px 10px 12px;
        }
        .m3d-pip-label {
          font-size: 0.625rem;
          font-weight: 300;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .m3d-pip-widget {
            bottom: 16px;
            left: 12px;
            padding: 8px 12px 8px 10px;
            border-radius: 8px;
            gap: 6px;
          }
          .m3d-pip-label {
            font-size: 0.5625rem;
          }
        }
        @media (pointer: coarse) {
          .m3d-pip-widget {
            min-height: 44px;
          }
        }
      `}</style>
    </>
  );
}
