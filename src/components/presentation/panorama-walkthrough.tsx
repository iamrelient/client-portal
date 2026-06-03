"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { PanoramaMetadata, PanoramaHotspot } from "@/types/panorama";
import { isInfoHotspot } from "@/types/panorama";
import type { PanoramaViewerHandle, PanoramaScene } from "./panorama-viewer";
import { PanoramaViewer } from "./panorama-viewer";
import { PanoramaInfoModal } from "./panorama-info-modal";
import { PanoramaMinimap } from "./panorama-minimap";
import { PanoramaRoomList } from "./panorama-room-list";
import { useGyroscope } from "./panorama-gyroscope";

interface RoomData {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
  /** Friendly name for the room — already resolved by section-
   *  panorama from metadata.roomLabel → section.title → filename.
   *  Children (minimap, room list, top bar) just render this. */
  label: string;
}

interface PanoramaWalkthroughProps {
  rooms: RoomData[];
  initialRoomId: string;
  accessToken: string;
  onExit: () => void;
}

export function PanoramaWalkthrough({
  rooms,
  initialRoomId,
  accessToken,
  onExit,
}: PanoramaWalkthroughProps) {
  const viewerRef = useRef<PanoramaViewerHandle>(null);
  const [currentRoomId, setCurrentRoomId] = useState(initialRoomId);
  const [transitioning, setTransitioning] = useState(false);
  const [infoHotspot, setInfoHotspot] = useState<PanoramaHotspot | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { isSupported: gyroSupported, isEnabled: gyroEnabled, toggle: toggleGyro } = useGyroscope(viewerRef);

  // Respect the OS-level reduced-motion preference. When true, skip
  // the cinematic zoom and fall back to a quick crossfade.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Preload every scene image as soon as the walkthrough opens. By
  // the time the client clicks a nav hotspot, the target panorama is
  // already in the browser cache and loadScene resolves instantly —
  // no loading hiccup mid-transition that breaks the "flying into
  // the next room" illusion.
  //
  // Asset route serves the pre-baked viewer derivative (≤4K JPEG,
  // typically 1–3 MB), so preloading even a 10-room tour is ~20 MB
  // — comfortable on broadband, runs concurrently while the entry
  // room is fading in. Browser handles the parallelism + caching.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const preloads: HTMLImageElement[] = [];
    for (const room of rooms) {
      const img = new Image();
      img.src = room.imageUrl;
      preloads.push(img);
    }
    return () => {
      // Release references so the GC can free the decoded bitmaps
      // once the walkthrough closes.
      for (const img of preloads) {
        img.src = "";
      }
    };
  }, [rooms]);

  // Has floor plan?
  const hasFloorPlan = rooms.some((r) => r.metadata.floorPlan?.imageFileId);

  // Build scenes for Pannellum multi-scene mode. MUST be memoized —
  // PanoramaViewer's init effect depends on `scenes` by reference, so
  // rebuilding this array on every render (e.g. when `transitioning`
  // state flips during navigation) tears down and re-inits Pannellum
  // mid-flight. The new viewer comes up pointed at firstScene =
  // initialRoomId, so loadScene's request to switch to a different
  // scene gets clobbered by the fresh init — clients see "click goes
  // nowhere, stuck on the entry room." Memoizing by `rooms` keeps
  // the reference stable across state-only re-renders.
  const scenes: PanoramaScene[] = useMemo(
    () =>
      rooms.map((room) => ({
        id: room.sectionId,
        imageUrl: room.imageUrl,
        initialView: room.metadata.initialView,
        hotspots: room.metadata.hotspots,
      })),
    [rooms]
  );

  /** Matterport-style transition between rooms.
   *
   *  When the user clicks a navigation hotspot, we know which point in
   *  the *current* scene they aimed at — the hotspot's pitch/yaw. We
   *  animate the camera toward that direction while zooming in (HFOV
   *  shrinks from default ~110° down to ~40°) over ~550 ms. That
   *  perspective compression reads as forward motion through the
   *  doorway, the way a Matterport tour feels. Simultaneously the
   *  fade overlay darkens, masking the scene swap that happens at the
   *  zoom's tail. The new scene loads with its own initialView so the
   *  camera lands somewhere meaningful, then the overlay fades back.
   *
   *  Room-list clicks (no hotspot pitch/yaw) fall through to a quick
   *  crossfade — there's no spatial direction to zoom toward and we
   *  don't want the room list to feel slow. Reduced-motion users get
   *  the crossfade path too. */
  const handleNavigate = useCallback(
    (
      targetSectionId: string,
      fromPitch?: number,
      fromYaw?: number
    ) => {
      if (transitioning) return;
      const targetRoom = rooms.find((r) => r.sectionId === targetSectionId);
      if (!targetRoom) return;
      const viewer = viewerRef.current;
      if (!viewer) return;

      const useCinematic =
        !reducedMotion && fromPitch !== undefined && fromYaw !== undefined;

      setTransitioning(true);

      if (useCinematic) {
        // Phase 1 (0-550 ms): camera dollies toward the doorway.
        //
        // We only use the hotspot's YAW (horizontal direction). For
        // the pitch we hold roughly eye-level — most nav hotspots
        // sit on the floor near the doorway, and looking down into
        // the floor while "walking through" the door looks wrong.
        // Eye level keeps the illusion of striding forward.
        //
        // Easing toward (not all the way to) eye level lets a
        // doorway-above hotspot still tilt the head up a little.
        const targetPitch = fromPitch! * 0.2; // most of the way to 0
        // HFOV 72° gives a gentle perspective lean — feels like
        // leaning forward through a doorway, not the telephoto crop
        // we had at 40°.
        viewer.lookAt(targetPitch, fromYaw!, 72, 550);
      }

      // Phase 2 — scene swap. We do this slightly before the zoom
      // finishes so the loadScene crossfade overlaps the last of the
      // zoom motion. Net feel: continuous forward movement that
      // dissolves into the new room.
      const swapDelay = useCinematic ? 500 : 180;

      setTimeout(() => {
        const iv = targetRoom.metadata.initialView;
        // Pass the target's initialView so the new scene starts where
        // the admin intended, regardless of where the camera was
        // pointing when we left the old scene.
        viewer.loadScene(
          targetSectionId,
          iv?.pitch,
          iv?.yaw,
          iv?.hfov
        );
        setCurrentRoomId(targetSectionId);

        // Phase 3 — fade back to reveal the new room. Slightly longer
        // than the zoom-in for a satisfying "settle" feel.
        setTimeout(
          () => setTransitioning(false),
          useCinematic ? 500 : 350
        );
      }, swapDelay);
    },
    [rooms, transitioning, reducedMotion]
  );

  const handleSceneChange = useCallback((sceneId: string) => {
    setCurrentRoomId(sceneId);
  }, []);

  const handleInfoClick = useCallback((hotspot: PanoramaHotspot) => {
    if (isInfoHotspot(hotspot)) {
      setInfoHotspot(hotspot);
    }
  }, []);

  // Escape key to exit
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (infoHotspot) {
          setInfoHotspot(null);
        } else {
          onExit();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onExit, infoHotspot]);

  const currentRoom = rooms.find((r) => r.sectionId === currentRoomId);
  const currentLabel = currentRoom?.label ?? "Room";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "#060608",
      }}
    >
      {/* Transition fade overlay. Asymmetric easing: a slow accel-out
          during the zoom (so the darkening feels like accumulating
          forward momentum) and a quicker accel-in on reveal so the new
          room snaps into focus. Paired with handleNavigate's timing
          for the Matterport-feel transition. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          backgroundColor: "rgba(6,6,8,0.96)",
          opacity: transitioning ? 1 : 0,
          transition: transitioning
            ? "opacity 500ms cubic-bezier(0.4, 0, 0.2, 1)"
            : "opacity 350ms cubic-bezier(0.2, 0, 0.2, 1)",
          pointerEvents: transitioning ? "auto" : "none",
        }}
      />

      {/* Panorama viewer */}
      <PanoramaViewer
        ref={viewerRef}
        imageUrl={rooms[0].imageUrl}
        scenes={scenes}
        initialScene={initialRoomId}
        onNavigationHotspotClick={handleNavigate}
        onInfoHotspotClick={handleInfoClick}
        onSceneChange={handleSceneChange}
        autoRotate={-0.3}
      />

      {/* Top bar: room label + exit */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          background:
            "linear-gradient(to bottom, rgba(6,6,8,0.6), transparent)",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 300,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {currentLabel}
        </span>
        <div style={{ display: "flex", gap: "0.5rem", pointerEvents: "auto" }}>
          {/* Gyroscope toggle */}
          {gyroSupported && (
            <button
              onClick={toggleGyro}
              data-cursor-label="Gyroscope"
              style={{
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: gyroEnabled
                  ? "rgba(59,130,246,0.4)"
                  : "rgba(0,0,0,0.4)",
                backdropFilter: "blur(8px)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2a10 10 0 0 1 0 20" />
                <path d="M12 2a10 10 0 0 0 0 20" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </button>
          )}

          {/* Exit button */}
          <button
            onClick={onExit}
            data-cursor-label="Exit"
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
              <line
                x1="2"
                y1="2"
                x2="12"
                y2="12"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="1"
              />
              <line
                x1="12"
                y1="2"
                x2="2"
                y2="12"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="1"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mini-map or room list */}
      {rooms.length > 1 && (
        <div style={{ position: "absolute", bottom: 0, left: 0, zIndex: 20 }}>
          {hasFloorPlan ? (
            <PanoramaMinimap
              rooms={rooms}
              currentRoomId={currentRoomId}
              accessToken={accessToken}
              viewerRef={viewerRef}
              onNavigate={handleNavigate}
            />
          ) : (
            <PanoramaRoomList
              rooms={rooms}
              currentRoomId={currentRoomId}
              onNavigate={handleNavigate}
            />
          )}
        </div>
      )}

      {/* Info modal */}
      {infoHotspot && isInfoHotspot(infoHotspot) && (
        <PanoramaInfoModal
          content={infoHotspot.content}
          label={infoHotspot.label}
          accessToken={accessToken}
          onClose={() => setInfoHotspot(null)}
        />
      )}
    </div>
  );
}
