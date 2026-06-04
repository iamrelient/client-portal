"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";
import type { PanoramaMetadata, TourRoom } from "@/types/panorama";
import { deriveTourRooms, readTourRooms } from "@/lib/tour-rooms";

interface SectionPanoramaProps {
  section: SectionData;
  data: PresentationData;
  onWalkthroughEnter?: () => void;
  onWalkthroughExit?: () => void;
}

export function SectionPanorama({
  section,
  data,
  onWalkthroughEnter,
  onWalkthroughExit,
}: SectionPanoramaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [PanoViewer, setPanoViewer] = useState<
    typeof import("./panorama-viewer").PanoramaViewer | null
  >(null);
  const [WalkthroughComponent, setWalkthroughComponent] = useState<
    typeof import("./panorama-walkthrough").PanoramaWalkthrough | null
  >(null);
  const [reduced, setReduced] = useState(false);

  const metadata = (section.metadata || {}) as PanoramaMetadata;

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Observe visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Dynamically import panorama viewer when approaching viewport
  useEffect(() => {
    if (!visible) return;

    import("./panorama-viewer").then((mod) => {
      setPanoViewer(() => mod.PanoramaViewer);
    });
  }, [visible]);

  /** Every panorama section in the presentation. We treat the whole
   *  deck as a single walkthrough — bulk-uploading 10 panoramas
   *  gives you a 10-room tour out of the box, navigable via the
   *  room list. Nav hotspots between rooms become a spatial
   *  *enhancement* (point-and-go at the doorway you actually see),
   *  not the thing that wires the tour together.
   *
   *  Used to decide whether to launch walkthrough mode on activate
   *  and to build the scenes list for the multi-scene Pannellum
   *  viewer. */
  const allPanoramaSectionIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.sections) {
      if (s.type === "panorama" && s.file) {
        set.add(s.id);
      }
    }
    return set;
  }, [data.sections]);

  const handleActivate = useCallback(() => {
    // Snap the slide flush with the viewport before launching the
    // walkthrough. Two reasons:
    //   1. If the client clicked Explore from a half-scrolled
    //      position (the tour entry only partly visible), the
    //      walkthrough opens over whatever was scrolled to —
    //      that's invisible while the walkthrough is up but
    //      becomes obvious when they hit Exit and land back on
    //      a half-scrolled deck. Snapping first guarantees a
    //      clean return.
    //   2. The scroll-snap CSS only kicks in on user-initiated
    //      scrolling; a programmatic snap on activate covers the
    //      "clicked while not snapped" case.
    // behavior: "auto" is instant — we want the walkthrough to
    // open immediately, not after a 300ms smooth scroll.
    ref.current?.scrollIntoView({ behavior: "auto", block: "start" });

    // 2+ panoramas in the deck → always walkthrough. Hotspot clicks
    // switch scenes in-place via Pannellum loadScene, and the room
    // list lets clients jump anywhere even if no hotspots exist yet.
    // Solo mode only when this is the lone panorama in the deck.
    if (allPanoramaSectionIds.size > 1) {
      import("./panorama-walkthrough").then((mod) => {
        setWalkthroughComponent(() => mod.PanoramaWalkthrough);
        setWalkthroughActive(true);
        onWalkthroughEnter?.();
      });
      return;
    }
    setActivated(true);
  }, [allPanoramaSectionIds, onWalkthroughEnter]);

  const handleExit = useCallback(() => {
    setActivated(false);
  }, []);

  const handleWalkthroughExit = useCallback(() => {
    setWalkthroughActive(false);
    setWalkthroughComponent(null);
    onWalkthroughExit?.();
  }, [onWalkthroughExit]);

  const assetUrl = section.file
    ? `/api/present/${data.accessToken}/asset/${section.file.id}`
    : null;

  // Every panorama in the deck becomes a scene in the walkthrough.
  // Sorted by section order so the room list reads top-to-bottom the
  // way the admin authored it. Memoized so PanoramaWalkthrough's
  // `rooms` prop reference stays stable across re-renders — otherwise
  // its scenes memo would invalidate, the viewer's useEffect would
  // tear down Pannellum, and mid-navigation loadScene calls would
  // hit a freshly-rebuilt viewer pointed back at the entry room.
  //
  // We compute the room's friendly `label` here, where we have access
  // to both the section's `title` (admin-set Room Name) and the
  // backing file. Downstream components (minimap, room list, top
  // bar) just read room.label.
  const tourRooms = useMemo(
    () =>
      walkthroughActive
        ? data.sections
            .filter((s) => s.type === "panorama" && s.file)
            .sort((a, b) => a.order - b.order)
            .map((s, idx) => {
              const meta = (s.metadata || {}) as PanoramaMetadata;
              const fromFile = s.file!.originalName.replace(/\.[^.]+$/, "");
              const label =
                meta.roomLabel?.trim() ||
                s.title?.trim() ||
                fromFile ||
                `Room ${idx + 1}`;
              return {
                sectionId: s.id,
                imageUrl: `/api/present/${data.accessToken}/asset/${s.file!.id}`,
                metadata: meta,
                label,
              };
            })
        : [],
    [walkthroughActive, data.sections, data.accessToken]
  );

  /** Logical tour rooms (one per floor plan dot). Pulled from the
   *  presentation's tourRooms when present; falls back to deriving
   *  one room per panorama with legacy floorPlan metadata so old
   *  decks that haven't been re-saved post-migration still display.
   *  Passed into the walkthrough so the minimap can render one
   *  dot per room instead of one per pano. */
  const mapRooms: TourRoom[] = useMemo(() => {
    if (!walkthroughActive) return [];
    const stored = readTourRooms(data.tourRooms);
    if (stored.length > 0) return stored;
    const { rooms: derived } = deriveTourRooms(
      data.sections.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        metadata: s.metadata,
        file: s.file ? { originalName: s.file.originalName } : null,
      }))
    );
    return derived;
  }, [walkthroughActive, data.tourRooms, data.sections]);

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: "#060608",
        overflow: "hidden",
      }}
    >
      {assetUrl && !activated && !walkthroughActive && (
        <>
          {/* Static preview image.
           *
           *  Two paths:
           *  - **Custom tour hero** (presentation.tourHeroFileId):
           *    use the admin's chosen cover image natural-fit, no
           *    zoom hacks. Matterport / 3D Vista call this a "tour
           *    cover" — a normal photo that previews the experience
           *    without the equirectangular distortion.
           *  - **Equirectangular fallback**: when no cover is set,
           *    zoom the pano so only the middle band is visible.
           *    scale(1.6) hides the top/bottom ~20% where the
           *    poles look stretched, giving a wide-angle-photo
           *    feel without a separate asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {data.tourHeroFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/present/${data.accessToken}/asset/${data.tourHeroFileId}`}
              alt={section.title || "Tour cover"}
              loading="lazy"
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                pointerEvents: "none",
                WebkitUserDrag: "none",
                opacity: visible ? 1 : 0,
                transition: reduced ? "none" : "opacity 0.8s ease",
              } as React.CSSProperties}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl}
              alt={section.title || "360° panorama"}
              loading="lazy"
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 50%",
                transform: "scale(1.6)",
                transformOrigin: "center center",
                pointerEvents: "none",
                WebkitUserDrag: "none",
                opacity: visible ? 1 : 0,
                transition: reduced ? "none" : "opacity 0.8s ease",
              } as React.CSSProperties}
            />
          )}

          {/* Click overlay — darkened scrim + centered play CTA. */}
          <div
            onClick={handleActivate}
            data-cursor-label="Play tour"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              zIndex: 2,
              cursor: "pointer",
              // Heavier darkening when there's a hero image so the
              // play button + text read clearly. Lighter scrim on
              // the equirectangular preview so the room is still
              // identifiable.
              background: data.tourHeroFileId
                ? "linear-gradient(to bottom, rgba(6,6,8,0.45) 0%, rgba(6,6,8,0.62) 100%)"
                : "rgba(6,6,8,0.3)",
            }}
          >
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: reduced
                  ? "none"
                  : "opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1.25rem",
              }}
            >
              {/* Big play button — concentric rings + triangle so it
                  reads as "play this experience" universally. Pulse
                  animation draws the eye without being noisy. */}
              <div
                className="pano-play-button"
                style={{
                  position: "relative",
                  width: 96,
                  height: 96,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(6px)",
                    border: "1.5px solid rgba(255,255,255,0.5)",
                  }}
                />
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  style={{
                    position: "relative",
                    marginLeft: 4, // optical center for a triangle
                  }}
                >
                  <path
                    d="M8 6 L26 16 L8 26 Z"
                    fill="rgba(255,255,255,0.95)"
                  />
                </svg>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 300,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.95)",
                    textShadow: "0 2px 12px rgba(0,0,0,0.55)",
                  }}
                >
                  Click to view a 360&deg; tour
                </span>
                {allPanoramaSectionIds.size > 1 && (
                  <span
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 300,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.6)",
                      textShadow: "0 1px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    {allPanoramaSectionIds.size} rooms
                  </span>
                )}
              </div>
            </div>

            <style>{`
              .pano-play-button {
                animation: pano-play-pulse 2.6s ease-in-out infinite;
              }
              .pano-play-button:hover {
                transform: scale(1.08);
                transition: transform 200ms ease;
              }
              @keyframes pano-play-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.18); }
                50% { box-shadow: 0 0 0 18px rgba(255,255,255,0); }
              }
              @media (prefers-reduced-motion: reduce) {
                .pano-play-button { animation: none; }
              }
            `}</style>
          </div>
        </>
      )}

      {/* Active solo panorama */}
      {assetUrl && activated && PanoViewer && (
        <>
          <PanoViewer
            imageUrl={assetUrl}
            initialView={metadata.initialView}
            hotspots={metadata.hotspots}
            onNavigationHotspotClick={(targetId) => {
              // In solo mode, navigate to the target section if in same tour
              const targetSection = data.sections.find(
                (s) => s.id === targetId
              );
              if (targetSection) {
                // Scroll to that section
                const el = document.querySelector(
                  `[data-section-id="${targetId}"]`
                );
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }
            }}
          />

          {/* Exit button */}
          <button
            onClick={handleExit}
            data-cursor-label="Exit"
            style={{
              position: "absolute",
              top: "1.5rem",
              right: "1.5rem",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              border: "none",
              cursor: "pointer",
              zIndex: 10,
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
        </>
      )}

      {/* Walkthrough overlay */}
      {walkthroughActive && WalkthroughComponent && tourRooms.length > 0 && (
        <WalkthroughComponent
          rooms={tourRooms}
          mapRooms={mapRooms}
          initialRoomId={section.id}
          accessToken={data.accessToken}
          onExit={handleWalkthroughExit}
        />
      )}

      {/* No file fallback */}
      {!assetUrl && (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontSize: "0.875rem",
          }}
        >
          No panorama assigned
        </div>
      )}
    </div>
  );
}
