"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { Segment } from "./use-scroll-progress";

/* ------------------------------------------------------------------ */
/*  Model3DPiP — floating "back to floor plan" thumbnail               */
/*  Appears when user scrolls past the 3D model into chapter strips    */
/* ------------------------------------------------------------------ */

interface Model3DPiPProps {
  segments: Segment[];
  activeSectionIndex: number;
  onNavigate: (sectionIndex: number) => void;
  snapshotUrl?: string | null;
}

export function Model3DPiP({
  segments,
  activeSectionIndex,
  onNavigate,
  snapshotUrl,
}: Model3DPiPProps) {
  const prevShowRef = useRef(false);
  const [flyIn, setFlyIn] = useState(false);

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

  /* ---- Trigger fly-in animation every time showPiP goes false→true ---- */
  useEffect(() => {
    if (showPiP && !prevShowRef.current) {
      setFlyIn(true);
      const timer = setTimeout(() => setFlyIn(false), 650);
      return () => clearTimeout(timer);
    }
    prevShowRef.current = showPiP;
  }, [showPiP]);

  if (!model3D) return null;

  const label = model3D.title || "Floor Plan";

  return (
    <>
      <div
        data-clickable
        data-cursor-label="Floor Plan"
        onClick={() => onNavigate(model3D.sectionIndex)}
        className={`m3d-pip-card ${flyIn ? "m3d-pip-fly-in" : ""}`}
        style={{
          position: "fixed",
          zIndex: 45,
          overflow: "hidden",
          cursor: "pointer",
          opacity: showPiP ? 1 : 0,
          pointerEvents: showPiP ? "auto" : "none",
          // When not animating, use simple transitions for hide/show
          ...(!flyIn && {
            transform: showPiP ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
            transition: "opacity 0.35s ease, transform 0.35s ease",
          }),
        }}
      >
        {/* Thumbnail image from canvas snapshot */}
        {snapshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={snapshotUrl}
            alt={label}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          /* Fallback: dark placeholder with icon */
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0a0a0f",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="2" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <line x1="16" y1="4" x2="16" y2="20" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
              <line x1="4" y1="16" x2="16" y2="16" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
            </svg>
          </div>
        )}

        {/* Label overlay at bottom */}
        <div className="m3d-pip-label-bar">
          <span className="m3d-pip-label">{label}</span>
        </div>

        {/* Hover overlay */}
        <div className="m3d-pip-hover" />
      </div>

      <style>{`
        .m3d-pip-card {
          bottom: 80px;
          left: 24px;
          width: 15vw;
          min-width: 160px;
          max-width: 240px;
          aspect-ratio: 16 / 10;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .m3d-pip-card:hover {
          border-color: rgba(255,255,255,0.35);
          transform: scale(1.04) !important;
        }
        .m3d-pip-card:hover .m3d-pip-hover {
          opacity: 1;
        }
        .m3d-pip-hover {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .m3d-pip-label-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 6px 10px;
          background: linear-gradient(transparent, rgba(0,0,0,0.7));
          border-radius: 0 0 12px 12px;
        }
        .m3d-pip-label {
          font-size: 0.5625rem;
          font-weight: 300;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.7);
          white-space: nowrap;
        }

        /* Fly-in: every time PiP appears */
        .m3d-pip-fly-in {
          animation: m3dPipFlyIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes m3dPipFlyIn {
          from {
            transform: translate(35vw, -35vh) scale(1.2);
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
            width: 30vw;
            min-width: 120px;
            max-width: 160px;
            border-radius: 10px;
          }
          .m3d-pip-label-bar {
            padding: 4px 8px;
          }
          .m3d-pip-label {
            font-size: 0.5rem;
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
