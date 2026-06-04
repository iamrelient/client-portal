"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { PanoramaMetadata, TourRoom } from "@/types/panorama";
import type { PanoramaViewerHandle } from "./panorama-viewer";

interface PanoData {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
  label: string;
}

interface PanoramaMinimapProps {
  /** Logical rooms — one dot per entry. */
  mapRooms: TourRoom[];
  /** All panoramas in the walkthrough — used to look up which room
   *  is currently active (via the active pano's roomId or by
   *  matching against room.startingPanoSectionId). */
  panos: PanoData[];
  /** Currently-loaded scene id (= panorama section id). */
  currentRoomId: string;
  accessToken: string;
  viewerRef: React.RefObject<PanoramaViewerHandle | null>;
  /** Navigate to a section id — calling with a room's
   *  startingPanoSectionId jumps to that room. */
  onNavigate: (sectionId: string) => void;
}

/** Floor-plan minimap with grow-from-corner expansion.
 *
 *  One element. Idle: 150 px thumbnail anchored to the bottom-left
 *  corner. Hovering (or tapping on touch) animates width / bottom /
 *  left so the same element scales into a centered ~80vw panel
 *  with labeled, clickable room dots.
 *
 *  Sticky dismiss: closes only on outside pointerdown, dot click,
 *  or Escape. Mouse-leave does nothing — once it's open it stays
 *  open until the client takes an explicit action.
 *
 *  Renders one dot per TourRoom (the presentation's logical
 *  rooms). The currently-active room is detected by checking which
 *  room owns the active panorama (either via metadata.roomId or by
 *  matching the room's startingPanoSectionId). Clicking a dot
 *  navigates to that room's startingPanoSectionId. */
export function PanoramaMinimap({
  mapRooms,
  panos,
  currentRoomId,
  accessToken,
  viewerRef,
  onNavigate,
}: PanoramaMinimapProps) {
  const [expanded, setExpanded] = useState(false);
  const [yaw, setYaw] = useState(0);
  const rafRef = useRef<number>(0);
  const mapRef = useRef<HTMLDivElement>(null);

  // Track yaw via RAF so the heading arrow on the active room
  // marker rotates with the client's view.
  useEffect(() => {
    function update() {
      const viewer = viewerRef.current;
      if (viewer) {
        setYaw(viewer.getYaw());
      }
      rafRef.current = requestAnimationFrame(update);
    }
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewerRef]);

  // ── Sticky dismiss handlers ──
  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(e: PointerEvent) {
      const map = mapRef.current;
      if (!map) return;
      if (!map.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    const tid = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setExpanded(false);
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [expanded]);

  const handleOpen = useCallback(() => {
    setExpanded(true);
  }, []);

  const handleDotClick = useCallback(
    (room: TourRoom) => {
      // Jump to the room's starting pano. Falls back to the first
      // pano whose metadata.roomId points at this room (so half-
      // configured rooms with no starting pano still navigate
      // *somewhere*, rather than no-op).
      const target =
        room.startingPanoSectionId ??
        panos.find((p) => p.metadata.roomId === room.id)?.sectionId ??
        null;
      if (target) onNavigate(target);
      setExpanded(false);
    },
    [onNavigate, panos]
  );

  /** Currently active panorama (by section id) — used to look up
   *  its metadata for the per-pano north calibration. */
  const activePano = useMemo(
    () => panos.find((p) => p.sectionId === currentRoomId) ?? null,
    [panos, currentRoomId]
  );

  /** Which room owns the active panorama? Two ways:
   *    1. Active pano's metadata.roomId points at this room.
   *    2. Room's startingPanoSectionId === active pano's id
   *       (covers legacy-migrated rooms whose starter wasn't
   *       re-stamped onto the pano yet). */
  const activeRoomId = useMemo(() => {
    if (!activePano) return null;
    const fromMeta = activePano.metadata.roomId;
    if (fromMeta && mapRooms.some((r) => r.id === fromMeta)) {
      return fromMeta;
    }
    const fromStarter = mapRooms.find(
      (r) => r.startingPanoSectionId === currentRoomId
    );
    return fromStarter?.id ?? null;
  }, [activePano, mapRooms, currentRoomId]);

  /** Active room's floor plan — what we render as the background.
   *  When the active pano isn't on the map (rare, but happens for
   *  unassigned secondary viewpoints), fall back to whichever floor
   *  plan the FIRST room uses. */
  const floorPlanFileId = useMemo(() => {
    if (activeRoomId) {
      const room = mapRooms.find((r) => r.id === activeRoomId);
      if (room) return room.floorPlanImageFileId;
    }
    return mapRooms[0]?.floorPlanImageFileId ?? null;
  }, [activeRoomId, mapRooms]);

  /** Rooms anchored to whichever floor plan we're showing — keeps
   *  multi-floor decks coherent (don't draw a Floor 2 dot on the
   *  Floor 1 plan). */
  const visibleRooms = useMemo(
    () => mapRooms.filter((r) => r.floorPlanImageFileId === floorPlanFileId),
    [mapRooms, floorPlanFileId]
  );

  if (!floorPlanFileId) return null;

  const floorPlanSrc = `/api/present/${accessToken}/asset/${floorPlanFileId}`;

  // North calibration for the heading arrow — comes from the active
  // pano's per-pano northYaw (each pano was captured at a different
  // camera orientation, so the offset is per-pano even within the
  // same room).
  const northYaw = activePano?.metadata.northYaw ?? 0;

  const collapsedLayout = {
    bottom: "1rem",
    left: "1rem",
    width: "150px",
    maxHeight: "auto" as const,
  };
  const expandedLayout = {
    bottom: "10vh",
    left: "10vw",
    width: "80vw",
    maxHeight: "80vh" as const,
  };
  const layout = expanded ? expandedLayout : collapsedLayout;

  return (
    <div
      ref={mapRef}
      onMouseEnter={handleOpen}
      onClick={!expanded ? handleOpen : undefined}
      data-cursor-label={expanded ? undefined : "Map"}
      style={{
        position: "fixed",
        ...layout,
        zIndex: expanded ? 40 : 20,
        overflow: "hidden",
        background: "transparent",
        cursor: expanded ? "default" : "pointer",
        boxShadow: expanded ? "none" : "0 4px 14px rgba(0,0,0,0.5)",
        transition:
          "width 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "bottom 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "left 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "box-shadow 250ms ease",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxHeight: expanded ? "80vh" : "none",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={floorPlanSrc}
          alt="Floor plan"
          draggable={false}
          style={{
            width: "100%",
            height: "auto",
            maxHeight: expanded ? "80vh" : "none",
            objectFit: "contain",
            display: "block",
            opacity: 1,
          }}
        />

        {visibleRooms.map((room) => {
          const isCurrent = room.id === activeRoomId;
          const dotSize = expanded ? (isCurrent ? 18 : 14) : isCurrent ? 12 : 6;
          const labelVisible = expanded;
          return (
            <button
              key={room.id}
              type="button"
              disabled={!expanded}
              onClick={(e) => {
                e.stopPropagation();
                handleDotClick(room);
              }}
              data-cursor-label={
                expanded ? (isCurrent ? "Current" : "Jump") : undefined
              }
              title={room.name}
              style={{
                position: "absolute",
                left: `${room.markerX * 100}%`,
                top: `${room.markerY * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isCurrent ? 3 : 2,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: expanded
                  ? isCurrent
                    ? "default"
                    : "pointer"
                  : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                pointerEvents: expanded ? "auto" : "none",
              }}
            >
              <div
                className="minimap-dot"
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: "50%",
                  background: isCurrent
                    ? "#3b82f6"
                    : expanded
                      ? "rgba(255,255,255,0.75)"
                      : "rgba(255,255,255,0.55)",
                  border: `${expanded ? 2 : 1}px solid ${
                    isCurrent ? "white" : "rgba(255,255,255,0.5)"
                  }`,
                  boxShadow: isCurrent
                    ? expanded
                      ? "0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6)"
                      : "0 0 0 3px rgba(59,130,246,0.3)"
                    : expanded
                      ? "0 2px 10px rgba(0,0,0,0.6)"
                      : "none",
                  transition:
                    "width 250ms ease, height 250ms ease, box-shadow 250ms ease, transform 150ms ease",
                  animation: isCurrent ? "minimap-pulse 2s infinite" : "none",
                }}
              />
              {isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: expanded ? 24 : 18,
                    height: expanded ? 24 : 18,
                    transform: `translate(-50%, -50%) rotate(${
                      yaw - northYaw
                    }deg)`,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: expanded ? -6 : -4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: `${expanded ? 5 : 3}px solid transparent`,
                      borderRight: `${expanded ? 5 : 3}px solid transparent`,
                      borderBottom: `${expanded ? 7 : 5}px solid rgba(59,130,246,${expanded ? 0.95 : 0.8})`,
                    }}
                  />
                </div>
              )}
              {labelVisible && (
                <span
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: 400,
                    color: isCurrent
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.7)",
                    background: "rgba(0,0,0,0.65)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    pointerEvents: "none",
                    animation: "minimap-fade-in 400ms ease 100ms forwards",
                    opacity: 0,
                  }}
                >
                  {room.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes minimap-pulse {
          0%, 100% { box-shadow: 0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6); }
          50% { box-shadow: 0 0 0 12px rgba(59,130,246,0), 0 2px 10px rgba(0,0,0,0.6); }
        }
        @keyframes minimap-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .minimap-dot:hover {
          transform: scale(1.18);
        }
      `}</style>
    </div>
  );
}
