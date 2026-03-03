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

  // Track yaw via RAF
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

  // Find floor plan image (use the first room that has one)
  const floorPlanRoom = rooms.find((r) => r.metadata.floorPlan?.imageFileId);
  const floorPlanFileId = floorPlanRoom?.metadata.floorPlan?.imageFileId;

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (!floorPlanFileId) return null;

  const size = expanded ? { width: "40vw", maxWidth: 320 } : { width: 150 };

  return (
    <div
      onClick={handleToggle}
      style={{
        position: "relative",
        margin: "1rem",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(6,6,8,0.8)",
        backdropFilter: "blur(8px)",
        cursor: "pointer",
        transition: "width 0.3s ease, max-width 0.3s ease",
        ...size,
      }}
    >
      {/* Floor plan image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/present/${accessToken}/asset/${floorPlanFileId}`}
        alt="Floor plan"
        draggable={false}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          opacity: 0.7,
        }}
      />

      {/* Room markers */}
      {rooms.map((room) => {
        const fp = room.metadata.floorPlan;
        if (!fp) return null;

        const isCurrent = room.sectionId === currentRoomId;

        return (
          <div
            key={room.sectionId}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCurrent) onNavigate(room.sectionId);
            }}
            style={{
              position: "absolute",
              left: `${fp.markerX * 100}%`,
              top: `${fp.markerY * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: isCurrent ? 2 : 1,
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: isCurrent ? 14 : 8,
                height: isCurrent ? 14 : 8,
                borderRadius: "50%",
                background: isCurrent ? "#3b82f6" : "rgba(255,255,255,0.5)",
                border: isCurrent
                  ? "2px solid white"
                  : "1px solid rgba(255,255,255,0.3)",
                boxShadow: isCurrent
                  ? "0 0 0 4px rgba(59,130,246,0.3)"
                  : "none",
                transition: "all 0.3s ease",
                animation: isCurrent ? "minimap-pulse 2s infinite" : "none",
              }}
            />

            {/* Direction indicator for current room */}
            {isCurrent && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  width: 20,
                  height: 20,
                  transform: `translate(-50%, -50%) rotate(${yaw}deg)`,
                  pointerEvents: "none",
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
                    borderBottom: "5px solid rgba(59,130,246,0.8)",
                  }}
                />
              </div>
            )}

            {/* Label on expanded */}
            {expanded && room.metadata.roomLabel && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontSize: "0.5rem",
                  fontWeight: 400,
                  color: isCurrent
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {room.metadata.roomLabel}
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes minimap-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(59,130,246,0.3); }
          50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
        }
      `}</style>
    </div>
  );
}
