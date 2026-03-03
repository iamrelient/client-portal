"use client";

import { useEffect, useRef, useCallback } from "react";

interface PanoramaViewerProps {
  imageUrl: string;
  initialView?: { pitch: number; yaw: number };
  hotspots?: {
    pitch: number;
    yaw: number;
    label: string;
    targetSectionId: string;
  }[];
  onHotspotClick?: (targetSectionId: string) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

// Pannellum global type
interface PannellumViewer {
  getHfov: () => number;
  setHfov: (hfov: number) => void;
  destroy: () => void;
}

interface PannellumGlobal {
  viewer: (
    el: HTMLElement,
    config: Record<string, unknown>
  ) => PannellumViewer;
}

let pannellumLoaded = false;
let pannellumLoadPromise: Promise<void> | null = null;

function loadPannellum(): Promise<void> {
  if (pannellumLoaded) return Promise.resolve();
  if (pannellumLoadPromise) return pannellumLoadPromise;

  pannellumLoadPromise = new Promise<void>((resolve) => {
    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/pannellum/pannellum.css";
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement("script");
    script.src = "/pannellum/pannellum.js";
    script.onload = () => {
      pannellumLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });

  return pannellumLoadPromise;
}

export function PanoramaViewer({
  imageUrl,
  initialView,
  hotspots,
  onHotspotClick,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);

  const handleZoomIn = useCallback(() => {
    const v = viewerRef.current;
    if (v) v.setHfov(Math.max(v.getHfov() - 10, 40));
  }, []);

  const handleZoomOut = useCallback(() => {
    const v = viewerRef.current;
    if (v) v.setHfov(Math.min(v.getHfov() + 10, 120));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let destroyed = false;

    loadPannellum().then(() => {
      if (destroyed || !containerRef.current) return;

      const pannellum = (window as unknown as { pannellum: PannellumGlobal })
        .pannellum;

      const hotspotConfigs = (hotspots || []).map((hs) => ({
        pitch: hs.pitch,
        yaw: hs.yaw,
        type: "info",
        text: hs.label,
        clickHandlerFunc: () => onHotspotClick?.(hs.targetSectionId),
        cssClass: "pano-hotspot-custom",
      }));

      viewerRef.current = pannellum.viewer(containerRef.current, {
        type: "equirectangular",
        panorama: imageUrl,
        autoLoad: true,
        autoRotate: -0.5,
        compass: false,
        showControls: false,
        showFullscreenCtrl: false,
        hfov: 110,
        mouseZoom: true,
        touchPanSpeedCoeffFactor: 1,
        draggable: true,
        pitch: initialView?.pitch || 0,
        yaw: initialView?.yaw || 180,
        hotSpots: hotspotConfigs,
      });
    });

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [imageUrl, initialView, hotspots, onHotspotClick]);

  // Gyroscope support for mobile
  useEffect(() => {
    if (!("DeviceOrientationEvent" in window)) return;

    // Request permission on iOS 13+
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (doe.requestPermission) {
      // Permission must be requested from a user gesture — handled elsewhere
      return;
    }
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Custom controls — bottom right */}
      <div
        style={{
          position: "absolute",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 10,
        }}
      >
        {/* Zoom in */}
        <button
          onClick={handleZoomIn}
          data-cursor-label="Zoom"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="2" x2="7" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
            <line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
          </svg>
        </button>

        {/* Zoom out */}
        <button
          onClick={handleZoomOut}
          data-cursor-label="Zoom"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
          </svg>
        </button>
      </div>

      {/* Hotspot styling */}
      <style>{`
        .pano-hotspot-custom {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.1);
          animation: pano-hotspot-pulse 2s ease-in-out infinite;
          cursor: pointer;
        }
        @media (pointer: coarse) {
          .pano-hotspot-custom {
            width: 32px;
            height: 32px;
          }
        }
        .pano-hotspot-custom:hover span,
        .pano-hotspot-custom:active span {
          opacity: 1;
        }
        .pano-hotspot-custom span {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          font-size: 0.6875rem;
          font-weight: 300;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.8);
          background: rgba(0,0,0,0.5);
          padding: 2px 8px;
          opacity: 1;
          transition: opacity 0.2s ease;
        }
        @media (pointer: fine) {
          .pano-hotspot-custom span {
            opacity: 0.7;
          }
        }
        @keyframes pano-hotspot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
        }
        /* Hide default pannellum UI */
        .pnlm-about-msg, .pnlm-load-box, .pnlm-compass, .pnlm-controls-container {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
