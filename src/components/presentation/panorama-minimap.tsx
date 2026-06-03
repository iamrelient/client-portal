"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { PanoramaMetadata } from "@/types/panorama";
import type { PanoramaViewerHandle } from "./panorama-viewer";

interface RoomData {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
}

interface PanoramaMinimapProps {
  rooms: RoomData[];
  currentRoomId: string;
  accessToken: string;
  viewerRef: React.RefObject<PanoramaViewerHandle | null>;
  onNavigate: (sectionId: string) => void;
}

/** Friendly label for a room — mirrors the editor's helper so the
 *  expanded minimap reads with the same names admins see. */
function roomLabel(room: RoomData): string {
  const m = room.metadata;
  if (m.roomLabel?.trim()) return m.roomLabel.trim();
  // Fall back to a short id slice; the section title isn't passed
  // into RoomData, but the admin's roomLabel covers the common case.
  return `Room ${room.sectionId.slice(0, 4)}`;
}

/** Floor-plan minimap with hover-expand behavior.
 *
 *  Idle state: small (150 px wide) thumbnail in the bottom-left
 *  corner, just big enough to confirm the room's orientation on the
 *  floor. Hovering lifts it into a centered overlay (~min(60vw, 720
 *  px)) so the client can read room labels and click any marker to
 *  jump there. Pointer-leave collapses back.
 *
 *  We use opacity + transform + a stacked larger version anchored to
 *  the corner, rather than literally moving the small one — that
 *  keeps the corner thumbnail interactive (still shows current room
 *  + heading) even while the expanded version animates in. */
export function PanoramaMinimap({
  rooms,
  currentRoomId,
  accessToken,
  viewerRef,
  onNavigate,
}: PanoramaMinimapProps) {
  const [expanded, setExpanded] = useState(false);
  const [yaw, setYaw] = useState(0);
  const rafRef = useRef<number>(0);
  // Hover intent: small delay before collapsing so a tiny mouse jitter
  // between thumbnail and the expanded overlay doesn't close it.
  const collapseTimerRef = useRef<number | null>(null);

  // Track yaw via RAF so the heading arrow on the current-room marker
  // follows where the client is actually looking.
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

  // Find floor plan image (first room that has one set on this floor).
  const floorPlanRoom = rooms.find((r) => r.metadata.floorPlan?.imageFileId);
  const floorPlanFileId = floorPlanRoom?.metadata.floorPlan?.imageFileId;

  const handleEnter = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setExpanded(true);
  }, []);

  const handleLeave = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      window.clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = window.setTimeout(() => {
      setExpanded(false);
      collapseTimerRef.current = null;
    }, 120);
  }, []);

  // Touch-friendly toggle for the thumbnail — coarse-pointer devices
  // don't fire hover events reliably.
  const handleThumbnailClick = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current !== null) {
        window.clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  if (!floorPlanFileId) return null;

  const floorPlanSrc = `/api/present/${accessToken}/asset/${floorPlanFileId}`;

  return (
    <>
      {/* ── Thumbnail (always visible in corner) ── */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={handleThumbnailClick}
        data-cursor-label="Map"
        style={{
          position: "relative",
          margin: "1rem",
          width: 150,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(6,6,8,0.82)",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
          transition: "border-color 200ms ease, transform 200ms ease",
          transform: expanded ? "scale(0.96)" : "scale(1)",
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
            display: "block",
            opacity: 0.7,
          }}
        />
        {/* Markers — small, current room highlighted */}
        {rooms.map((room) => {
          const fp = room.metadata.floorPlan;
          if (!fp) return null;
          const isCurrent = room.sectionId === currentRoomId;
          return (
            <div
              key={room.sectionId}
              style={{
                position: "absolute",
                left: `${fp.markerX * 100}%`,
                top: `${fp.markerY * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isCurrent ? 2 : 1,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: isCurrent ? 12 : 6,
                  height: isCurrent ? 12 : 6,
                  borderRadius: "50%",
                  background: isCurrent ? "#3b82f6" : "rgba(255,255,255,0.55)",
                  border: isCurrent
                    ? "2px solid white"
                    : "1px solid rgba(255,255,255,0.4)",
                  boxShadow: isCurrent
                    ? "0 0 0 3px rgba(59,130,246,0.3)"
                    : "none",
                }}
              />
              {isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: 18,
                    height: 18,
                    transform: `translate(-50%, -50%) rotate(${yaw}deg)`,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "3px solid transparent",
                      borderRight: "3px solid transparent",
                      borderBottom: "5px solid rgba(59,130,246,0.9)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {/* "Hover for map" cue — fades out once expanded so it
            doesn't shout for attention once the action is engaged. */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "3px 6px",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
            fontSize: "0.55rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.7)",
            textAlign: "center",
            pointerEvents: "none",
            opacity: expanded ? 0 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          Hover · Map
        </div>
      </div>

      {/* ── Expanded overlay — floats over the center of the screen ── */}
      <div
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: expanded
            ? "translate(-50%, -50%) scale(1)"
            : "translate(-50%, -50%) scale(0.92)",
          width: "min(60vw, 720px)",
          maxHeight: "70vh",
          zIndex: 40,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(6,6,8,0.92)",
          backdropFilter: "blur(16px)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
          transition:
            "opacity 220ms cubic-bezier(0.4, 0, 0.2, 1), transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "0.625rem",
              fontWeight: 400,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Floor Plan · {rooms.length} rooms
          </span>
          <span
            style={{
              fontSize: "0.625rem",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            Click a dot to jump
          </span>
        </div>
        <div
          style={{
            position: "relative",
            width: "100%",
            maxHeight: "calc(70vh - 50px)",
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
              maxHeight: "calc(70vh - 50px)",
              objectFit: "contain",
              display: "block",
              opacity: 0.9,
            }}
          />
          {rooms.map((room) => {
            const fp = room.metadata.floorPlan;
            if (!fp) return null;
            const isCurrent = room.sectionId === currentRoomId;
            return (
              <button
                key={room.sectionId}
                type="button"
                onClick={() => {
                  if (!isCurrent) onNavigate(room.sectionId);
                }}
                data-cursor-label={isCurrent ? "Current" : "Jump"}
                title={roomLabel(room)}
                style={{
                  position: "absolute",
                  left: `${fp.markerX * 100}%`,
                  top: `${fp.markerY * 100}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isCurrent ? 3 : 2,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: isCurrent ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: isCurrent ? 18 : 14,
                    height: isCurrent ? 18 : 14,
                    borderRadius: "50%",
                    background: isCurrent
                      ? "#3b82f6"
                      : "rgba(255,255,255,0.7)",
                    border: "2px solid white",
                    boxShadow: isCurrent
                      ? "0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6)"
                      : "0 2px 10px rgba(0,0,0,0.6)",
                    transition: "transform 150ms ease, box-shadow 200ms ease",
                    animation: isCurrent
                      ? "minimap-pulse 2s infinite"
                      : "none",
                  }}
                  className="minimap-dot"
                />
                {isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: 9,
                      left: "50%",
                      width: 24,
                      height: 24,
                      transform: `translate(-50%, -50%) rotate(${yaw}deg)`,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -6,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 0,
                        height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderBottom: "7px solid rgba(59,130,246,0.95)",
                      }}
                    />
                  </div>
                )}
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
                  }}
                >
                  {roomLabel(room)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes minimap-pulse {
          0%, 100% { box-shadow: 0 0 0 5px rgba(59,130,246,0.35), 0 2px 10px rgba(0,0,0,0.6); }
          50% { box-shadow: 0 0 0 12px rgba(59,130,246,0), 0 2px 10px rgba(0,0,0,0.6); }
        }
        .minimap-dot:hover {
          transform: scale(1.18);
        }
      `}</style>
    </>
  );
}
