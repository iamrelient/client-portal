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
  /** Single-scene-mode floor targets (same-room viewpoints). In
   *  multi-scene mode each PanoramaScene carries its own. */
  floorTargets?: FloorTarget[];
}

/** A same-room viewpoint reachable by clicking the floor (Matterport
 *  / 3D Vista style) instead of an arrow. pitch/yaw are where the
 *  destination sits in the *current* scene; clicking on or near that
 *  floor spot loads the target panorama. */
export interface FloorTarget {
  sectionId: string;
  pitch: number;
  yaw: number;
  label: string;
}

export interface PanoramaScene {
  id: string;
  imageUrl: string;
  initialView?: { pitch: number; yaw: number; hfov?: number };
  hotspots?: PanoramaHotspot[];
  /** Same-room viewpoints shown as floor discs + reachable by
   *  clicking the ground, rather than arrow hotspots. */
  floorTargets?: FloorTarget[];
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

/** Foreshorten factor for a disc lying on the floor, seen at a given
 *  pitch. Straight down (pitch -90) → 1 (full circle). Near the
 *  horizon → thin ellipse. Clamped so it never fully collapses. */
function floorForeshorten(pitchDeg: number): number {
  const rad = (Math.abs(pitchDeg) * Math.PI) / 180;
  return Math.max(0.18, Math.sin(rad));
}

/** Creates the DOM for a floor-disc destination marker — a flat ring
 *  that reads as painted on the ground, with a soft pulse. The disc
 *  is foreshortened (scaleY) to match the floor perspective at its
 *  pitch. */
function createFloorDisc(
  target: FloorTarget,
  onClick: () => void
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "pano-hs-floor";
  wrapper.title = target.label;
  wrapper.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  const sy = floorForeshorten(target.pitch);
  wrapper.innerHTML = `
    <div class="pano-hs-floor-disc" style="transform: scaleY(${sy.toFixed(
      3
    )});">
      <div class="pano-hs-floor-ring"></div>
      <div class="pano-hs-floor-dot"></div>
    </div>
    <span class="pano-hs-floor-label">${target.label}</span>
  `;
  return wrapper;
}

/** Build Pannellum hotspot configs for floor-disc targets. */
function buildFloorTargetConfigs(
  targets: FloorTarget[],
  onNav?: (targetId: string, fromPitch?: number, fromYaw?: number) => void
): Record<string, unknown>[] {
  return targets.map((t) => ({
    pitch: t.pitch,
    yaw: t.yaw,
    type: "info",
    createTooltipFunc: (hotSpotDiv: HTMLElement) => {
      const el = createFloorDisc(t, () => onNav?.(t.sectionId, t.pitch, t.yaw));
      hotSpotDiv.appendChild(el);
    },
    createTooltipArgs: "",
  }));
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
    floorTargets,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  /** Floor reticle DOM node (cursor-following ground circle). */
  const reticleRef = useRef<HTMLDivElement>(null);
  /** Per-scene floor targets, looked up at click time by current
   *  scene id. Single-scene mode stores under the synthetic "__solo". */
  const floorTargetsBySceneRef = useRef<Map<string, FloorTarget[]>>(
    new Map()
  );
  const currentSceneIdRef = useRef<string>("__solo");
  /** mousedown bookkeeping so we can tell a click (navigate) from a
   *  drag (look around). */
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);

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
          floorTargetsBySceneRef.current = new Map();

          for (const scene of scenes) {
            const sceneFloor = scene.floorTargets || [];
            floorTargetsBySceneRef.current.set(scene.id, sceneFloor);
            sceneConfigs[scene.id] = {
              type: "equirectangular",
              panorama: scene.imageUrl,
              pitch: scene.initialView?.pitch ?? 0,
              yaw: scene.initialView?.yaw ?? 180,
              hfov: scene.initialView?.hfov ?? 110,
              hotSpots: [
                ...buildHotspotConfigs(
                  scene.hotspots || [],
                  onNavigationHotspotClick,
                  onInfoHotspotClick
                ),
                ...buildFloorTargetConfigs(
                  sceneFloor,
                  onNavigationHotspotClick
                ),
              ],
            };
          }
          currentSceneIdRef.current = initialScene || scenes[0].id;

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

          viewerRef.current.on("scenechange", (sceneId: unknown) => {
            currentSceneIdRef.current = sceneId as string;
            onSceneChange?.(sceneId as string);
          });
        } else {
          // Single panorama mode
          floorTargetsBySceneRef.current = new Map([
            ["__solo", floorTargets || []],
          ]);
          currentSceneIdRef.current = "__solo";
          const hotspotConfigs = [
            ...buildHotspotConfigs(
              hotspots || [],
              onNavigationHotspotClick,
              onInfoHotspotClick
            ),
            ...buildFloorTargetConfigs(
              floorTargets || [],
              onNavigationHotspotClick
            ),
          ];

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

  // ── Matterport-style floor navigation ──
  // A cursor-following ground reticle (perspective-matched circle)
  // plus "click the floor near a viewpoint to go there". Bound once;
  // reads live state from refs so it survives scene changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const currentTargets = () =>
      floorTargetsBySceneRef.current.get(currentSceneIdRef.current) || [];

    // Wrap a yaw delta into [-180, 180] so distance math doesn't
    // blow up across the 360° seam.
    const wrapYaw = (d: number) => ((d + 540) % 360) - 180;
    const angularDist = (
      p1: number,
      y1: number,
      p2: number,
      y2: number
    ) => {
      const dp = p1 - p2;
      const dy = wrapYaw(y1 - y2) * Math.cos((p1 * Math.PI) / 180);
      return Math.sqrt(dp * dp + dy * dy);
    };

    function handleMove(e: MouseEvent) {
      const viewer = viewerRef.current;
      const reticle = reticleRef.current;
      if (!viewer || !reticle) return;
      // Only show the reticle when this scene actually has floor
      // destinations — otherwise it's confusing dead UI.
      if (currentTargets().length === 0) {
        reticle.style.opacity = "0";
        return;
      }
      let coords: [number, number] | null = null;
      try {
        coords = viewer.mouseEventToCoords(e);
      } catch {
        coords = null;
      }
      if (!coords) {
        reticle.style.opacity = "0";
        return;
      }
      const [pitch] = coords;
      // Only over the floor (looking down past a small margin).
      if (pitch > -4) {
        reticle.style.opacity = "0";
        return;
      }
      const rect = el!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const sy = floorForeshorten(pitch);
      reticle.style.left = `${x}px`;
      reticle.style.top = `${y}px`;
      reticle.style.transform = `translate(-50%, -50%) scaleY(${sy.toFixed(
        3
      )})`;
      reticle.style.opacity = "1";
    }

    function handleLeave() {
      if (reticleRef.current) reticleRef.current.style.opacity = "0";
    }

    function handleDown(e: MouseEvent) {
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    }

    function handleUp(e: MouseEvent) {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return;
      // Distinguish click from drag: small movement, quick release.
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > 8 || Date.now() - down.t > 500) return;

      const targets = currentTargets();
      if (targets.length === 0) return;

      const viewer = viewerRef.current;
      if (!viewer) return;
      let coords: [number, number] | null = null;
      try {
        coords = viewer.mouseEventToCoords(e);
      } catch {
        coords = null;
      }
      if (!coords) return;
      const [pitch, yaw] = coords;
      // Find the nearest floor target to where they clicked.
      let best: FloorTarget | null = null;
      let bestDist = Infinity;
      for (const t of targets) {
        const d = angularDist(pitch, yaw, t.pitch, t.yaw);
        if (d < bestDist) {
          bestDist = d;
          best = t;
        }
      }
      // ~32° tolerance — clicking the "general area" of the floor
      // near a viewpoint counts, not just the exact disc.
      if (best && bestDist < 32) {
        onNavigationHotspotClick?.(best.sectionId, best.pitch, best.yaw);
      }
    }

    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    el.addEventListener("mousedown", handleDown);
    el.addEventListener("mouseup", handleUp);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
      el.removeEventListener("mousedown", handleDown);
      el.removeEventListener("mouseup", handleUp);
    };
  }, [onNavigationHotspotClick]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />

      {/* Cursor-following floor reticle — a perspective ring that
          tells the viewer "you can click the ground here to move."
          Positioned + foreshortened by the floor-nav effect; hidden
          (opacity 0) unless hovering the floor in a room that has
          other viewpoints. */}
      <div
        ref={reticleRef}
        className="pano-floor-reticle"
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: 0,
          pointerEvents: "none",
          zIndex: 6,
          transition: "opacity 140ms ease",
        }}
      >
        <div className="pano-floor-reticle-ring" />
      </div>

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

        /* Floor-disc destination marker (same-room viewpoints).
           The disc element is foreshortened inline (scaleY) to match
           the floor perspective; here we just style the ring + dot
           and pulse. */
        .pano-hs-floor {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-26px, -26px);
        }
        .pano-hs-floor-disc {
          width: 52px;
          height: 52px;
          position: relative;
          transform-origin: center center;
        }
        .pano-hs-floor-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.85);
          background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 60%, transparent 72%);
          box-shadow: 0 0 12px rgba(0,0,0,0.45);
          animation: pano-floor-pulse 2.2s ease-in-out infinite;
        }
        .pano-hs-floor-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.95);
          transform: translate(-50%, -50%);
        }
        .pano-hs-floor-label {
          margin-top: 6px;
          white-space: nowrap;
          font-size: 0.625rem;
          font-weight: 300;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.85);
          background: rgba(0,0,0,0.5);
          padding: 2px 8px;
          border-radius: 3px;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .pano-hs-floor:hover .pano-hs-floor-label { opacity: 1; }
        @keyframes pano-floor-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.25), 0 0 12px rgba(0,0,0,0.45); }
          50% { box-shadow: 0 0 0 10px rgba(255,255,255,0), 0 0 12px rgba(0,0,0,0.45); }
        }

        /* Cursor-following floor reticle */
        .pano-floor-reticle-ring {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.9);
          background: radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 55%, transparent 70%);
          box-shadow: 0 0 14px rgba(0,0,0,0.5);
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
