"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  const { isSupported: gyroSupported, isEnabled: gyroEnabled, toggle: toggleGyro } = useGyroscope(viewerRef);

  // Has floor plan?
  const hasFloorPlan = rooms.some((r) => r.metadata.floorPlan?.imageFileId);

  // Build scenes for Pannellum multi-scene mode
  const scenes: PanoramaScene[] = rooms.map((room) => ({
    id: room.sectionId,
    imageUrl: room.imageUrl,
    initialView: room.metadata.initialView,
    hotspots: room.metadata.hotspots,
  }));

  const handleNavigate = useCallback(
    (targetSectionId: string) => {
      if (transitioning) return;
      const targetRoom = rooms.find((r) => r.sectionId === targetSectionId);
      if (!targetRoom) return;

      setTransitioning(true);

      // CSS fade: fade out → load scene → fade in
      setTimeout(() => {
        viewerRef.current?.loadScene(targetSectionId);
        setCurrentRoomId(targetSectionId);

        setTimeout(() => {
          setTransitioning(false);
        }, 400);
      }, 200);
    },
    [rooms, transitioning]
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
  const currentLabel =
    currentRoom?.metadata.roomLabel || currentRoom?.metadata.roomLabel || "Room";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "#060608",
      }}
    >
      {/* Transition fade overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          backgroundColor: "rgba(6,6,8,0.95)",
          opacity: transitioning ? 1 : 0,
          transition: "opacity 0.2s ease",
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
