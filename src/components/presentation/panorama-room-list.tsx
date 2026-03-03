"use client";

import type { PanoramaMetadata } from "@/types/panorama";

interface RoomData {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
}

interface PanoramaRoomListProps {
  rooms: RoomData[];
  currentRoomId: string;
  onNavigate: (sectionId: string) => void;
}

export function PanoramaRoomList({
  rooms,
  currentRoomId,
  onNavigate,
}: PanoramaRoomListProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        padding: "1rem 1.5rem",
        overflowX: "auto",
        maxWidth: "100vw",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {rooms.map((room, idx) => {
        const isCurrent = room.sectionId === currentRoomId;
        const label =
          room.metadata.roomLabel || `Room ${idx + 1}`;

        return (
          <button
            key={room.sectionId}
            onClick={() => onNavigate(room.sectionId)}
            style={{
              flexShrink: 0,
              padding: "0.375rem 0.875rem",
              fontSize: "0.6875rem",
              fontWeight: isCurrent ? 400 : 300,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: isCurrent
                ? "rgba(255,255,255,0.95)"
                : "rgba(255,255,255,0.5)",
              background: isCurrent
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.4)",
              border: isCurrent
                ? "1px solid rgba(255,255,255,0.2)"
                : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
