"use client";

import { Html } from "@react-three/drei";
import type {
  Model3DHotspot,
  PreviewHotspot,
} from "@/types/model3d";
import { isNavigateHotspot } from "@/types/model3d";

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface Model3DHotspotsProps {
  hotspots: Model3DHotspot[];
  onNavigate?: (targetChapter: string) => void;
  onPreviewClick?: (hotspot: PreviewHotspot) => void;
}

/* ------------------------------------------------------------------ */
/*  SVG icons                                                           */
/* ------------------------------------------------------------------ */

function ArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      style={{ display: "block" }}
    >
      <path
        d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="7"
        cy="7"
        r="1.5"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Hotspot styles (injected once)                                      */
/* ------------------------------------------------------------------ */

const HOTSPOT_STYLES = `
.model3d-hs-nav {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.model3d-hs-nav-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: model3d-nav-bob 2s ease-in-out infinite;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.model3d-hs-nav:hover .model3d-hs-nav-icon {
  border-color: rgba(255,255,255,0.8);
  background: rgba(255,255,255,0.15);
  transform: scale(1.15);
}
.model3d-hs-nav-label {
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 300;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 2px 8px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.model3d-hs-nav:hover .model3d-hs-nav-label {
  opacity: 1;
}
@keyframes model3d-nav-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.model3d-hs-preview {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.model3d-hs-preview-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: model3d-preview-pulse 2s ease-in-out infinite;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}
.model3d-hs-preview:hover .model3d-hs-preview-icon {
  border-color: rgba(255,255,255,0.8);
  background: rgba(255,255,255,0.18);
  transform: scale(1.15);
}
.model3d-hs-preview-label {
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 300;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 2px 8px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.model3d-hs-preview:hover .model3d-hs-preview-label {
  opacity: 1;
}
@keyframes model3d-preview-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
  50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
}

@media (pointer: coarse) {
  .model3d-hs-nav-icon { width: 48px; height: 48px; }
  .model3d-hs-nav-label { opacity: 1; }
  .model3d-hs-preview-icon { width: 44px; height: 44px; }
  .model3d-hs-preview-label { opacity: 1; }
}
`;

/* ------------------------------------------------------------------ */
/*  Single hotspot marker                                               */
/* ------------------------------------------------------------------ */

function HotspotMarker({
  hotspot,
  onNavigate,
  onPreviewClick,
}: {
  hotspot: Model3DHotspot;
  onNavigate?: (targetChapter: string) => void;
  onPreviewClick?: (hotspot: PreviewHotspot) => void;
}) {
  const isNav = isNavigateHotspot(hotspot);
  const className = isNav ? "model3d-hs-nav" : "model3d-hs-preview";
  const iconClass = isNav ? "model3d-hs-nav-icon" : "model3d-hs-preview-icon";
  const labelClass = isNav ? "model3d-hs-nav-label" : "model3d-hs-preview-label";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isNav) {
      onNavigate?.(hotspot.targetChapter);
    } else {
      onPreviewClick?.(hotspot as PreviewHotspot);
    }
  };

  return (
    <Html
      position={[hotspot.position.x, hotspot.position.y, hotspot.position.z]}
      center
      distanceFactor={4}
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "auto" }}
    >
      <div
        className={className}
        data-cursor-label={hotspot.label}
        data-clickable
        onClick={handleClick}
      >
        <div className={iconClass}>
          {isNav ? <ArrowIcon /> : <EyeIcon />}
        </div>
        <span className={labelClass}>{hotspot.label}</span>
      </div>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/*  Model3DHotspots — renders all hotspot markers                       */
/* ------------------------------------------------------------------ */

export function Model3DHotspots({
  hotspots,
  onNavigate,
  onPreviewClick,
}: Model3DHotspotsProps) {
  if (!hotspots.length) return null;

  return (
    <>
      {/* Inject styles once */}
      <Html center style={{ display: "none" }} position={[0, 0, 0]}>
        <style>{HOTSPOT_STYLES}</style>
      </Html>

      {hotspots.map((hs) => (
        <HotspotMarker
          key={hs.id}
          hotspot={hs}
          onNavigate={onNavigate}
          onPreviewClick={onPreviewClick}
        />
      ))}
    </>
  );
}
