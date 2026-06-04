"use client";

import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { PanoramaHotspot } from "@/types/panorama";

export interface PanoramaViewerProps {
  imageUrl: string;
  initialView?: { pitch: number; yaw: number; hfov?: number };
  hotspots?: PanoramaHotspot[];
  /** Fired when the user clicks a navigation hotspot. `fromPitch` and
   *  `fromYaw` are the clicked hotspot's coordinates in the *current*
   *  scene — used by the walkthrough to animate a Matterport-style
   *  camera zoom toward the doorway before swapping scenes. Optional
   *  so legacy callers (solo-mode, editor) can ignore them. */
  onNavigationHotspotClick?: (
    targetSectionId: string,
    fromPitch?: number,
    fromYaw?: number
  ) => void;
  onInfoHotspotClick?: (hotspot: PanoramaHotspot) => void;
  autoRotate?: number;
  scenes?: PanoramaScene[];
  initialScene?: string;
  onSceneChange?: (sceneId: string) => void;
}

export interface PanoramaScene {
  id: string;
  imageUrl: string;
  initialView?: { pitch: number; yaw: number; hfov?: number };
  hotspots?: PanoramaHotspot[];
}

export interface PanoramaViewerHandle {
  getPitch: () => number;
  getYaw: () => number;
  getHfov: () => number;
  setPitch: (p: number) => void;
  setYaw: (y: number) => void;
  setHfov: (h: number) => void;
  /** `animated`: pass a number of milliseconds for the tween duration,
   *  `true` for ~1 s default, `false` for instant. */
  lookAt: (
    pitch: number,
    yaw: number,
    hfov?: number,
    animated?: boolean | number
  ) => void;
  loadScene: (
    sceneId: string,
    pitch?: number,
    yaw?: number,
    hfov?: number
  ) => void;
  startAutoRotate: (speed?: number) => void;
  stopAutoRotate: () => void;
  resize: () => void;
  destroy: () => void;
}

// Pannellum global type
interface PannellumViewer {
  getHfov: () => number;
  setHfov: (hfov: number) => void;
  getPitch: () => number;
  getYaw: () => number;
  setPitch: (p: number) => void;
  setYaw: (y: number) => void;
  /** Pannellum's lookAt — `animated` is either `true` (default ~1 s
   *  tween) or an explicit number of milliseconds for the camera
   *  movement. We pass a number for the cinematic zoom transition so
   *  the timing is predictable. */
  lookAt: (
    pitch: number,
    yaw: number,
    hfov?: number,
    animated?: boolean | number
  ) => void;
  /** loadScene takes optional camera overrides — pitch/yaw/hfov let
   *  us drop the viewer into a specific orientation when the new
   *  scene loads (so navigating from a hotspot in Room A lands the
   *  camera at Room B's initialView, not wherever the camera
   *  happened to be when we left A). */
  loadScene: (
    sceneId: string,
    pitch?: number,
    yaw?: number,
    hfov?: number
  ) => void;
  startAutoRotate: (speed?: number) => void;
  stopAutoRotate: () => void;
  resize: () => void;
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
  mouseEventToCoords: (e: MouseEvent) => [number, number];
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
    if (!document.querySelector('link[href="/pannellum/pannellum.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/pannellum/pannellum.css";
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(
      'script[src="/pannellum/pannellum.js"]'
    );
    if (existingScript) {
      pannellumLoaded = true;
      resolve();
      return;
    }

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

// Creates DOM element for a navigation hotspot (floor arrow)
function createNavigationTooltip(
  hotspot: PanoramaHotspot,
  onClick: () => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "pano-hs-nav";
  wrapper.title = hotspot.label;
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  // Arrow SVG
  wrapper.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" class="pano-hs-nav-arrow">
      <circle cx="18" cy="18" r="17" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" fill="rgba(255,255,255,0.08)"/>
      <path d="M18 10 L24 20 L18 17 L12 20 Z" fill="rgba(255,255,255,0.85)"/>
    </svg>
    <span class="pano-hs-nav-label">${hotspot.label}</span>
  `;

  return wrapper;
}

// Creates DOM element for an info hotspot (circle with "i")
function createInfoTooltip(
  hotspot: PanoramaHotspot,
  onClick: () => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "pano-hs-info";
  wrapper.title = hotspot.label;
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  wrapper.innerHTML = `
    <div class="pano-hs-info-circle">i</div>
    <span class="pano-hs-info-label">${hotspot.label}</span>
  `;

  return wrapper;
}

function buildHotspotConfigs(
  hotspots: PanoramaHotspot[],
  onNav?: (
    targetId: string,
    fromPitch?: number,
    fromYaw?: number
  ) => void,
  onInfo?: (hs: PanoramaHotspot) => void
): Record<string, unknown>[] {
  return hotspots.map((hs) => ({
    pitch: hs.pitch,
    yaw: hs.yaw,
    type: "info",
    // Pannellum invokes this as `createTooltipFunc(hotSpotDiv, args)`
    // and expects us to *modify* hotSpotDiv. Returning a wrapper that
    // never gets attached anywhere is why hotspots have been silently
    // invisible — Pannellum's default hotspot sprite image isn't in
    // /public/pannellum so the fallback shows nothing either.
    //
    // For nav hotspots we forward the hotspot's pitch/yaw so the
    // walkthrough can do a Matterport-style camera zoom toward the
    // doorway before swapping scenes.
    createTooltipFunc: (hotSpotDiv: HTMLElement) => {
      const el =
        hs.type === "navigation"
          ? createNavigationTooltip(hs, () =>
              onNav?.(hs.targetSectionId, hs.pitch, hs.yaw)
            )
          : createInfoTooltip(hs, () => onInfo?.(hs));
      hotSpotDiv.appendChild(el);
    },
    createTooltipArgs: "",
  }));
}

export const PanoramaViewer = forwardRef<
  PanoramaViewerHandle,
  PanoramaViewerProps
>(function PanoramaViewer(
  {
    imageUrl,
    initialView,
    hotspots,
    onNavigationHotspotClick,
    onInfoHotspotClick,
    autoRotate = -0.5,
    scenes,
    initialScene,
    onSceneChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);

  useImperativeHandle(ref, () => ({
    getPitch: () => viewerRef.current?.getPitch() ?? 0,
    getYaw: () => viewerRef.current?.getYaw() ?? 0,
    getHfov: () => viewerRef.current?.getHfov() ?? 110,
    setPitch: (p) => viewerRef.current?.setPitch(p),
    setYaw: (y) => viewerRef.current?.setYaw(y),
    setHfov: (h) => viewerRef.current?.setHfov(h),
    lookAt: (pitch, yaw, hfov, animated) =>
      viewerRef.current?.lookAt(pitch, yaw, hfov, animated ?? true),
    loadScene: (sceneId, pitch, yaw, hfov) =>
      viewerRef.current?.loadScene(sceneId, pitch, yaw, hfov),
    startAutoRotate: (speed) =>
      viewerRef.current?.startAutoRotate(speed ?? -0.5),
    stopAutoRotate: () => viewerRef.current?.stopAutoRotate(),
    resize: () => viewerRef.current?.resize(),
    destroy: () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    },
  }));

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
    let resizeObserver: ResizeObserver | null = null;

    loadPannellum().then(() => {
      if (destroyed || !containerRef.current) return;

      const pannellum = (window as unknown as { pannellum: PannellumGlobal })
        .pannellum;

      // Wait for the container to have valid dimensions before initializing.
      // On first activation the container may not have been painted yet,
      // causing Pannellum to capture 0×0 dimensions and render broken/zoomed-in.
      const initWhenReady = () => {
        if (destroyed || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          requestAnimationFrame(initWhenReady);
          return;
        }

        // Multi-scene mode
        if (scenes && scenes.length > 0) {
          const sceneConfigs: Record<string, Record<string, unknown>> = {};

          for (const scene of scenes) {
            sceneConfigs[scene.id] = {
              type: "equirectangular",
              panorama: scene.imageUrl,
              pitch: scene.initialView?.pitch ?? 0,
              yaw: scene.initialView?.yaw ?? 180,
              hfov: scene.initialView?.hfov ?? 110,
              hotSpots: buildHotspotConfigs(
                scene.hotspots || [],
                onNavigationHotspotClick,
                onInfoHotspotClick
              ),
            };
          }

          viewerRef.current = pannellum.viewer(containerRef.current!, {
            default: {
              firstScene: initialScene || scenes[0].id,
              autoLoad: true,
              autoRotate: autoRotate,
              compass: false,
              showControls: false,
              showFullscreenCtrl: false,
              mouseZoom: true,
              // Snappier mouse + touch response. Pannellum's default
              // friction (0.15) carries momentum for ~1 s after the
              // pointer releases — admin's complaint that the pan
              // "feels laggy" is that drift settling. 0.4 still has
              // a hint of glide so the motion doesn't feel robotic,
              // but the camera lands much closer to where the user
              // let go. touchPanSpeedCoeffFactor 1.2 mirrors the
              // bump on touch where finger drags otherwise read as
              // slow vs the screen distance covered.
              friction: 0.4,
              touchPanSpeedCoeffFactor: 1.2,
              draggable: true,
              sceneFadeDuration: 500,
            },
            scenes: sceneConfigs,
          });

          if (onSceneChange) {
            viewerRef.current.on("scenechange", (sceneId: unknown) => {
              onSceneChange(sceneId as string);
            });
          }
        } else {
          // Single panorama mode
          const hotspotConfigs = buildHotspotConfigs(
            hotspots || [],
            onNavigationHotspotClick,
            onInfoHotspotClick
          );

          viewerRef.current = pannellum.viewer(containerRef.current!, {
            type: "equirectangular",
            panorama: imageUrl,
            autoLoad: true,
            autoRotate: autoRotate,
            compass: false,
            showControls: false,
            showFullscreenCtrl: false,
            hfov: initialView?.hfov ?? 110,
            mouseZoom: true,
            // Match the multi-scene config's snappier feel — see
            // the friction comment above.
            friction: 0.4,
            touchPanSpeedCoeffFactor: 1.2,
            draggable: true,
            pitch: initialView?.pitch ?? 0,
            yaw: initialView?.yaw ?? 180,
            hotSpots: hotspotConfigs,
          });
        }

        // Safety resize after first paint to handle any remaining layout settling
        setTimeout(() => {
          viewerRef.current?.resize();
        }, 100);

        // Watch for container resize (window resize, orientation change, etc.)
        resizeObserver = new ResizeObserver(() => {
          viewerRef.current?.resize();
        });
        resizeObserver.observe(containerRef.current!);
      };

      // Double-rAF: first rAF queues work before next paint,
      // second rAF runs after that paint has completed — ensures the
      // container is fully painted so Pannellum captures correct dimensions.
      requestAnimationFrame(() => requestAnimationFrame(initWhenReady));
    });

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, scenes, initialScene]);

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

      {/* Hotspot + default UI styles */}
      <style>{`
        /* Navigation hotspot */
        .pano-hs-nav {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-18px, -18px);
        }
        .pano-hs-nav-arrow {
          animation: pano-nav-bob 2s ease-in-out infinite;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
        }
        .pano-hs-nav-label {
          margin-top: 4px;
          white-space: nowrap;
          font-size: 0.6875rem;
          font-weight: 300;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.8);
          background: rgba(0,0,0,0.5);
          padding: 2px 8px;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .pano-hs-nav:hover .pano-hs-nav-label,
        .pano-hs-nav:active .pano-hs-nav-label {
          opacity: 1;
        }
        @media (pointer: coarse) {
          .pano-hs-nav { transform: translate(-24px, -24px); }
          .pano-hs-nav-arrow { width: 48px; height: 48px; }
          .pano-hs-nav-label { opacity: 1; }
        }
        @keyframes pano-nav-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        /* Info hotspot */
        .pano-hs-info {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-14px, -14px);
        }
        .pano-hs-info-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          font-style: italic;
          color: rgba(255,255,255,0.85);
          animation: pano-info-pulse 2s ease-in-out infinite;
          backdrop-filter: blur(4px);
        }
        .pano-hs-info-label {
          margin-top: 4px;
          white-space: nowrap;
          font-size: 0.6875rem;
          font-weight: 300;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.8);
          background: rgba(0,0,0,0.5);
          padding: 2px 8px;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .pano-hs-info:hover .pano-hs-info-label,
        .pano-hs-info:active .pano-hs-info-label {
          opacity: 1;
        }
        @media (pointer: coarse) {
          .pano-hs-info { transform: translate(-22px, -22px); }
          .pano-hs-info-circle { width: 44px; height: 44px; font-size: 20px; }
          .pano-hs-info-label { opacity: 1; }
        }
        @keyframes pano-info-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }

        /* Hide default pannellum UI */
        .pnlm-about-msg, .pnlm-load-box, .pnlm-compass, .pnlm-controls-container {
          display: none !important;
        }
        .pnlm-hotspot-base {
          background: none !important;
          border: none !important;
          width: auto !important;
          height: auto !important;
        }
        .pnlm-tooltip {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      `}</style>
    </div>
  );
});
