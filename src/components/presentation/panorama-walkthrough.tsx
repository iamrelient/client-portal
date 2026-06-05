"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type {
  PanoramaMetadata,
  PanoramaHotspot,
  TourRoom,
} from "@/types/panorama";
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
  /** Logical "tour rooms" — one entry per floor-plan dot. May
   *  contain fewer entries than `rooms` because multiple panoramas
   *  can share a single room. Drives the minimap; the walkthrough
   *  itself still loads every entry in `rooms` as a Pannellum scene
   *  so hotspot navigation works across the full pano set. */
  mapRooms: TourRoom[];
  initialRoomId: string;
  accessToken: string;
  /** Open on the floor-plan room chooser instead of dropping into
   *  the starting panorama (only when there are mapped rooms). */
  startOnMap?: boolean;
  onExit: () => void;
}

export function PanoramaWalkthrough({
  rooms,
  mapRooms,
  initialRoomId,
  accessToken,
  startOnMap,
  onExit,
}: PanoramaWalkthroughProps) {
  const viewerRef = useRef<PanoramaViewerHandle>(null);
  const [currentRoomId, setCurrentRoomId] = useState(initialRoomId);
  /** When true, show the room-chooser overlay instead of the live
   *  pano. Starts true only when startOnMap + there's a floor plan
   *  with rooms to choose from. */
  const [choosingStart, setChoosingStart] = useState(
    () => !!startOnMap && mapRooms.length > 0
  );
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
  // Minimap shows when there's at least one mapped tour room
  // (preferred) OR a legacy per-pano floorPlan blob to fall back on.
  const hasFloorPlan =
    mapRooms.length > 0 ||
    rooms.some((r) => r.metadata.floorPlan?.imageFileId);

  // Build scenes for Pannellum multi-scene mode. MUST be memoized —
  // PanoramaViewer's init effect depends on `scenes` by reference, so
  // rebuilding this array on every render (e.g. when `transitioning`
  // state flips during navigation) tears down and re-inits Pannellum
  // mid-flight. The new viewer comes up pointed at firstScene =
  // initialRoomId, so loadScene's request to switch to a different
  // scene gets clobbered by the fresh init — clients see "click goes
  // nowhere, stuck on the entry room." Memoizing by `rooms` keeps
  // the reference stable across state-only re-renders.
  const scenes: PanoramaScene[] = useMemo(() => {
    // Group panos into rooms. Prefer the explicit roomId; fall back
    // to matching label (case-insensitive) so "named them both
    // Lobby" groups even without a room assignment.
    const roomKey = (r: RoomData) =>
      r.metadata.roomId?.trim() ||
      `label:${r.label.trim().toLowerCase()}`;

    return rooms.map((room) => {
      const myKey = roomKey(room);
      const allHotspots = room.metadata.hotspots ?? [];

      // Floor targets come ONLY from same-room nav hotspots the admin
      // explicitly placed — rendered at the exact spot they dropped
      // them. (We used to auto-create a floor dot to EVERY other pano
      // in the room and scatter them at arbitrary positions, which
      // produced phantom dots "at your feet" linking to rooms you
      // never wired. Gone — what you place is what shows.)
      // Dedup by target so a forward + auto-reverse to the same pano
      // doesn't stack two discs.
      const seenTargets = new Set<string>();
      const floorTargets: PanoramaScene["floorTargets"] = [];
      const arrowHotspots: typeof allHotspots = [];

      for (const h of allHotspots) {
        if (h.type === "navigation") {
          const target = rooms.find(
            (r) => r.sectionId === h.targetSectionId
          );
          if (target && roomKey(target) === myKey) {
            // Same-room link → floor disc at the placed spot.
            if (!seenTargets.has(h.targetSectionId)) {
              seenTargets.add(h.targetSectionId);
              floorTargets.push({
                sectionId: h.targetSectionId,
                pitch: h.pitch,
                yaw: h.yaw,
                label: target.label,
              });
            }
            continue; // not an arrow
          }
        }
        // Cross-room nav + all info hotspots keep their normal style.
        arrowHotspots.push(h);
      }

      return {
        id: room.sectionId,
        imageUrl: room.imageUrl,
        initialView: room.metadata.initialView,
        hotspots: arrowHotspots,
        floorTargets,
      };
    });
  }, [rooms]);

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

  /** All viewpoints that belong to the same room as the current one,
   *  so a room with multiple shoot points exposes a switcher (you
   *  shouldn't have to wire a hotspot just to see the 2nd Lobby
   *  shot). Grouped by roomId when set; otherwise by matching label
   *  (case-insensitive) so "named them both Lobby" works even
   *  without an explicit room assignment. Stable order by the room
   *  list / section order they arrived in. */
  const sameRoomViewpoints = useMemo(() => {
    if (!currentRoom) return [];
    const key =
      currentRoom.metadata.roomId?.trim() ||
      `label:${currentRoom.label.trim().toLowerCase()}`;
    const groupKey = (r: RoomData) =>
      r.metadata.roomId?.trim() ||
      `label:${r.label.trim().toLowerCase()}`;
    return rooms.filter((r) => groupKey(r) === key);
  }, [rooms, currentRoom]);

  /** Enter a room from the start chooser. Navigates to the room's
   *  starting pano (or the first pano in it) and dismisses the
   *  chooser overlay. */
  const handleChooseStart = useCallback(
    (room: TourRoom) => {
      const target =
        room.startingPanoSectionId ??
        rooms.find((r) => r.metadata.roomId === room.id)?.sectionId ??
        null;
      setChoosingStart(false);
      if (target && target !== currentRoomId) {
        handleNavigate(target);
      }
    },
    [rooms, currentRoomId, handleNavigate]
  );

  // Floor plan shown in the chooser (first room's plan; rooms on it).
  const chooserPlanId = mapRooms[0]?.floorPlanImageFileId ?? null;
  const chooserRooms = useMemo(
    () =>
      chooserPlanId
        ? mapRooms.filter((r) => r.floorPlanImageFileId === chooserPlanId)
        : [],
    [mapRooms, chooserPlanId]
  );

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

      {/* Start chooser — opens on the floor plan so the viewer picks
          a room to begin in, instead of dropping into a pano. Sits
          above the (already-loaded) viewer; picking a room navigates
          there and dismisses this. */}
      {choosingStart && chooserPlanId && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            background: "rgba(6,6,8,0.92)",
            backdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "3vh 3vw",
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              fontWeight: 300,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.85)",
              marginBottom: "1.25rem",
              textAlign: "center",
            }}
          >
            Choose a room to begin
          </div>
          <div
            style={{
              position: "relative",
              maxWidth: "min(80vw, 900px)",
              maxHeight: "72vh",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/present/${accessToken}/asset/${chooserPlanId}`}
              alt="Floor plan"
              draggable={false}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "72vh",
                objectFit: "contain",
              }}
            />
            {chooserRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => handleChooseStart(room)}
                data-cursor-label="Start here"
                title={room.name}
                style={{
                  position: "absolute",
                  left: `${room.markerX * 100}%`,
                  top: `${room.markerY * 100}%`,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span
                  className="walkthrough-start-dot"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    border: "2px solid white",
                    boxShadow:
                      "0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6)",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 400,
                    color: "#fff",
                    background: "rgba(0,0,0,0.7)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {room.name}
                </span>
              </button>
            ))}
          </div>

          {/* Skip — just start at the default entry pano. */}
          <button
            type="button"
            onClick={() => setChoosingStart(false)}
            style={{
              marginTop: "1.5rem",
              fontSize: "0.6875rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 999,
              padding: "0.5rem 1.25rem",
              cursor: "pointer",
            }}
          >
            Skip — start anywhere
          </button>

          <style>{`
            .walkthrough-start-dot { animation: minimap-pulse 2s infinite; }
            @keyframes minimap-pulse {
              0%, 100% { box-shadow: 0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6); }
              50% { box-shadow: 0 0 0 12px rgba(59,130,246,0), 0 2px 10px rgba(0,0,0,0.6); }
            }
          `}</style>
        </div>
      )}

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            pointerEvents: "auto",
          }}
        >
          {/* ESC-to-exit hint — sits next to the action buttons so
              clients (especially desktop users) know the key works.
              On touch the cue is mostly decorative; the X button is
              the actual exit there. */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0 0.65rem",
              height: 28,
              fontSize: "0.625rem",
              fontWeight: 400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.12)",
              userSelect: "none",
            }}
            title="Press ESC to exit the tour"
          >
            <kbd
              style={{
                fontFamily: "inherit",
                fontSize: "0.625rem",
                padding: "1px 5px",
                borderRadius: 3,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "rgba(255,255,255,0.95)",
              }}
            >
              ESC
            </kbd>
            <span>Exit</span>
          </span>

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

      {/* Same-room viewpoint switcher — appears when the current
          room has more than one panorama (multiple shoot points).
          Lets the client step through every viewpoint in the room
          without needing a wired hotspot. Bottom-center, above the
          minimap. */}
      {sameRoomViewpoints.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <span
            style={{
              fontSize: "0.625rem",
              fontWeight: 300,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
              paddingRight: "0.25rem",
            }}
          >
            {currentLabel} · view
          </span>
          {sameRoomViewpoints.map((vp, idx) => {
            const isCurrent = vp.sectionId === currentRoomId;
            return (
              <button
                key={vp.sectionId}
                onClick={() => {
                  if (!isCurrent) handleNavigate(vp.sectionId);
                }}
                data-cursor-label={isCurrent ? "Current view" : "Switch view"}
                title={`View ${idx + 1}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.6875rem",
                  fontWeight: 400,
                  cursor: isCurrent ? "default" : "pointer",
                  color: isCurrent
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(255,255,255,0.7)",
                  background: isCurrent
                    ? "rgba(59,130,246,0.85)"
                    : "rgba(255,255,255,0.08)",
                  border: isCurrent
                    ? "1px solid rgba(255,255,255,0.5)"
                    : "1px solid rgba(255,255,255,0.12)",
                  transition: "all 0.15s ease",
                }}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Mini-map or room list */}
      {rooms.length > 1 && (
        <div style={{ position: "absolute", bottom: 0, left: 0, zIndex: 20 }}>
          {hasFloorPlan ? (
            <PanoramaMinimap
              mapRooms={mapRooms}
              panos={rooms}
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
