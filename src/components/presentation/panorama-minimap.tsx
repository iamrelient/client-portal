"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { PanoramaMetadata } from "@/types/panorama";
import type { PanoramaViewerHandle } from "./panorama-viewer";

interface RoomData {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
  /** Friendly room name resolved upstream (roomLabel → title →
   *  filename). Already correct — the minimap just renders it. */
  label: string;
}

interface PanoramaMinimapProps {
  rooms: RoomData[];
  currentRoomId: string;
  accessToken: string;
  viewerRef: React.RefObject<PanoramaViewerHandle | null>;
  onNavigate: (sectionId: string) => void;
}


/** Floor-plan minimap with grow-from-corner expansion.
 *
 *  One element. Idle: 150 px wide thumbnail anchored to the bottom-
 *  left corner, just big enough to confirm the room's orientation.
 *  Hovering (or tapping on touch) animates width / bottom / left so
 *  the same element scales out into a centered ~80vw panel with
 *  labeled, clickable room dots.
 *
 *  Dismiss model is sticky on purpose — the previous mouse-leave
 *  collapse closed the panel before clients could reach a dot. Now
 *  it only closes when:
 *    • The user clicks anywhere outside the map, OR
 *    • The user clicks a dot to jump to that room, OR
 *    • The user presses Escape.
 *  Mouse-leave does nothing. */
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
  const mapRef = useRef<HTMLDivElement>(null);

  // Track yaw via RAF so the heading arrow on the current-room
  // marker follows where the client is actually looking.
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
  // Click outside the map → collapse. Capture phase so it fires
  // *before* the walkthrough's other handlers (e.g. anything that
  // might consume the click event first). Only attached while
  // expanded so we don't pay the listener cost when closed.
  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(e: PointerEvent) {
      const map = mapRef.current;
      if (!map) return;
      if (!map.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    // Defer attaching by one tick so the opening click (which
    // bubbles up from the thumbnail) doesn't immediately re-close.
    const tid = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [expanded]);

  // ESC closes the map (without exiting the walkthrough). We register
  // capture-phase so we win over the walkthrough's window-level ESC
  // handler when the map is open. When closed we don't attach the
  // handler, so ESC behaves normally (walkthrough exits).
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
    (sectionId: string, isCurrent: boolean) => {
      if (isCurrent) return;
      onNavigate(sectionId);
      // Collapse after navigation so the new room is unobstructed.
      setExpanded(false);
    },
    [onNavigate]
  );

  // Find floor plan image (first room that has one set on this floor).
  const floorPlanRoom = rooms.find((r) => r.metadata.floorPlan?.imageFileId);
  const floorPlanFileId = floorPlanRoom?.metadata.floorPlan?.imageFileId;
  if (!floorPlanFileId) return null;

  const floorPlanSrc = `/api/present/${accessToken}/asset/${floorPlanFileId}`;

  // ── Layout — transitions between corner and centered ──
  // Both states position by `bottom` + `left`, animating those plus
  // `width` and `max-height`. Single source of truth for layout so
  // the corner-to-center morph is a clean CSS transition without
  // mid-frame jumps from changing positioning anchors.
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
        borderRadius: expanded ? 12 : 8,
        overflow: "hidden",
        // Subtle outline so the map's edge reads against the
        // panorama, but NO opaque fill — the floor plan image
        // often has a transparent background and we want the
        // panorama to show through those areas (admin's intent
        // when they exported a PNG with transparency).
        border: `1px solid rgba(255,255,255,${expanded ? 0.22 : 0.18})`,
        background: "transparent",
        cursor: expanded ? "default" : "pointer",
        // Drop shadow gives the panel "lift" without a fill —
        // still reads as a discrete element floating over the room.
        boxShadow: expanded
          ? "0 20px 60px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4)"
          : "0 4px 14px rgba(0,0,0,0.5)",
        // Animate every property that differs between states. The
        // bezier matches the cinematic transition's curve so map
        // expansion + scene transition share a visual language.
        transition:
          "width 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "max-height 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "bottom 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "left 350ms cubic-bezier(0.4, 0, 0.2, 1), " +
          "border-radius 250ms ease, " +
          "box-shadow 250ms ease",
      }}
    >
      {/* ── Header (expanded only) ── */}
      {expanded && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // Localized backdrop — container is transparent so the
            // header would otherwise float against whatever panorama
            // is behind. Subtle blur + tint keeps the text legible
            // without bringing back the full dark panel.
            background: "rgba(6,6,8,0.72)",
            backdropFilter: "blur(14px)",
            // Fade in slightly after the size animation begins so
            // the text doesn't pop while the panel is still narrow.
            animation: "minimap-fade-in 350ms ease forwards",
            opacity: 0,
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
            Click a dot to jump · ESC to close
          </span>
        </div>
      )}

      {/* ── Image + dots wrapper ──
          Height: auto so the image's aspect ratio drives layout.
          object-fit: contain on the image, so when expanded with
          max-height: 80vh the image stays inside without cropping. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          // When collapsed the image just fills the small thumbnail;
          // when expanded we honor max-height so the image isn't
          // pushed off the bottom of the viewport.
          maxHeight: expanded ? "calc(80vh - 50px)" : "none",
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
            maxHeight: expanded ? "calc(80vh - 50px)" : "none",
            objectFit: "contain",
            display: "block",
            // No opacity dim — the floor plan may be a PNG with a
            // transparent background, and dimming would multiply
            // the panorama color through the transparent areas.
            // Plain image with the panorama showing through naturally
            // gives the cleanest look.
            opacity: 1,
          }}
        />

        {/* Room markers */}
        {rooms.map((room) => {
          const fp = room.metadata.floorPlan;
          if (!fp) return null;
          const isCurrent = room.sectionId === currentRoomId;

          // Dot sizing scales between collapsed/expanded so the
          // markers remain readable but never overwhelming.
          const dotSize = expanded ? (isCurrent ? 18 : 14) : isCurrent ? 12 : 6;
          const labelVisible = expanded;

          return (
            <button
              key={room.sectionId}
              type="button"
              disabled={!expanded}
              onClick={(e) => {
                e.stopPropagation();
                handleDotClick(room.sectionId, isCurrent);
              }}
              data-cursor-label={
                expanded ? (isCurrent ? "Current" : "Jump") : undefined
              }
              title={room.label}
              style={{
                position: "absolute",
                left: `${fp.markerX * 100}%`,
                top: `${fp.markerY * 100}%`,
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
                // Click-through when collapsed so the parent click
                // handler can pick up the open gesture; receive
                // events normally when expanded.
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
                    // Calibrated heading: subtract the panorama's
                    // northYaw so the arrow points relative to
                    // "north on the floor plan" instead of relative
                    // to wherever Pannellum's yaw 0 happens to land.
                    // If the admin hasn't calibrated yet, northYaw
                    // is undefined → fall back to raw yaw.
                    transform: `translate(-50%, -50%) rotate(${
                      yaw - (fp.northYaw ?? 0)
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
                    // Fade the label in once the panel has had time
                    // to grow — premature labels look cramped during
                    // the size transition.
                    animation: "minimap-fade-in 400ms ease 100ms forwards",
                    opacity: 0,
                  }}
                >
                  {room.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* "Hover · Map" cue — only when collapsed. */}
      {!expanded && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "3px 6px",
            background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
            fontSize: "0.55rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.7)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          Hover · Map
        </div>
      )}

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
