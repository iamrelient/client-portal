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

  // ── Prefetch tour images while the client dwells on the cover ──
  // The *first* panorama load is the slow one: a cache-miss has to
  // round-trip to Google Drive (1–4 s). By warming the browser + edge
  // cache the moment the tour cover scrolls into view — while the
  // client is still reading the play screen — the scene is already
  // downloaded by the time they click in, so the click feels instant.
  // No quality change: this fetches the exact same 4K viewer image the
  // tour would load anyway, just earlier. Order: the entry scene and
  // the floor-plan images (shown first in the start-on-map chooser) go
  // first; the remaining rooms follow so hotspot/room jumps are warm
  // too. On Data Saver / slow links we only warm the entry scene.
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || prefetchedRef.current) return;
    prefetchedRef.current = true;

    const warm = (url: string) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    };

    // 1. Entry scene — what loads the instant they click (non-map start).
    if (assetUrl) warm(assetUrl);

    // 2. Floor-plan images — shown first when start-on-map is enabled.
    for (const r of readTourRooms(data.tourRooms)) {
      if (r.floorPlanImageFileId) {
        warm(`/api/present/${data.accessToken}/asset/${r.floorPlanImageFileId}`);
      }
    }

    // 3. The rest of the rooms — skip on Data Saver / slow connections.
    const conn = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const frugal =
      conn?.saveData === true ||
      (conn?.effectiveType ? /2g|3g/.test(conn.effectiveType) : false);
    if (!frugal) {
      for (const s of data.sections) {
        if (s.type === "panorama" && s.file && s.id !== section.id) {
          warm(`/api/present/${data.accessToken}/asset/${s.file.id}`);
        }
      }
    }
  }, [visible, assetUrl, data.sections, data.accessToken, data.tourRooms, section.id]);

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
  const tourRooms = useMemo(() => {
    if (!walkthroughActive) return [];
    // Resolve a pano's display name from its assigned room first
    // (the dropdown sets metadata.roomId → TourRoom.name), then fall
    // back to legacy roomLabel / section title / filename.
    const storedRooms = readTourRooms(data.tourRooms);
    const roomNameById = new Map(storedRooms.map((r) => [r.id, r.name]));
    return data.sections
      .filter((s) => s.type === "panorama" && s.file)
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => {
        const meta = (s.metadata || {}) as PanoramaMetadata;
        const fromRoom = meta.roomId
          ? roomNameById.get(meta.roomId)?.trim()
          : undefined;
        const fromFile = s.file!.originalName.replace(/\.[^.]+$/, "");
        const label =
          fromRoom ||
          meta.roomLabel?.trim() ||
          s.title?.trim() ||
          fromFile ||
          `Room ${idx + 1}`;
        return {
          sectionId: s.id,
          imageUrl: `/api/present/${data.accessToken}/asset/${s.file!.id}`,
          metadata: meta,
          label,
          // Tile-streaming params when this pano has a baked pyramid —
          // the viewer then loads cube tiles from the tiles route
          // instead of the single equirect JPEG.
          multires: s.file!.multires
            ? {
                ...s.file!.multires,
                basePath: `/api/present/${data.accessToken}/tiles/${s.file!.id}`,
              }
            : null,
        };
      });
  }, [walkthroughActive, data.sections, data.accessToken, data.tourRooms]);

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

  /** The play call-to-action (button + label + pulse styles). Shared
   *  by both cover layouts so they stay identical. */
  const playCta = (
    <>
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
          // Shrinks the CTA on phones (it dwarfed the cover there) while
          // staying at today's size on desktop — clamp maxes out on wide
          // viewports, so PC is unchanged.
          gap: "clamp(0.6rem, 2vw, 1.25rem)",
        }}
      >
        <div
          className="pano-play-button"
          style={{
            position: "relative",
            width: "clamp(72px, 16vw, 128px)",
            height: "clamp(72px, 16vw, 128px)",
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
              border: "2px solid rgba(255,255,255,0.55)",
            }}
          />
          <svg
            width="38%"
            height="38%"
            viewBox="0 0 32 32"
            fill="none"
            style={{ position: "relative", marginLeft: "4%" }}
          >
            <path d="M8 6 L26 16 L8 26 Z" fill="rgba(255,255,255,0.95)" />
          </svg>
        </div>
        <span
          style={{
            fontSize: "clamp(0.8rem, 3.2vw, 1.25rem)",
            fontWeight: 400,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.98)",
            textShadow: "0 2px 14px rgba(0,0,0,0.6)",
            textAlign: "center",
          }}
        >
          Click to view a 360&deg; tour
        </span>
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
    </>
  );

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        // On the space theme keep this transparent so the animated
        // starfield (rendered behind the deck) shows through around the
        // contained cover image — a solid fill blacked it out. The
        // light theme keeps the near-black stage so images pop.
        backgroundColor: data.theme === "space" ? "transparent" : "#060608",
        overflow: "hidden",
      }}
    >
      {assetUrl && !activated && !walkthroughActive && (
        data.tourHeroFileId ? (
          /* Custom cover: framed like a carousel image — object-fit
             contain, centered, with the deck background showing
             around it, so it's consistent with the image slides.
             The scrim + play CTA sit on the image box only.
             On MOBILE (≤640px) it instead fills the screen (object-fit
             cover) so the cover isn't a tiny letterboxed thumbnail —
             see the media query below. Desktop is unchanged. */
          <div
            className="pano-cover-pad"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 60px",
            }}
          >
            <style>{`
              @media (max-width: 640px) {
                .pano-cover-pad { padding: 0 !important; }
                .pano-cover-box { width: 100% !important; height: 100% !important; }
                .pano-cover-img {
                  width: 100% !important;
                  height: 100% !important;
                  max-height: none !important;
                  object-fit: cover !important;
                  border-radius: 0 !important;
                }
              }
            `}</style>
            <div
              onClick={handleActivate}
              data-cursor-label="Play tour"
              className="pano-cover-box"
              style={{
                position: "relative",
                display: "inline-flex",
                maxWidth: "100%",
                maxHeight: "100%",
                cursor: "pointer",
                opacity: visible ? 1 : 0,
                transition: reduced ? "none" : "opacity 0.8s ease",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/present/${data.accessToken}/asset/${data.tourHeroFileId}`}
                alt={section.title || "Tour cover"}
                loading="lazy"
                draggable={false}
                className="pano-cover-img"
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "calc(100dvh - 80px)",
                  objectFit: "contain",
                  borderRadius: "2px",
                  boxShadow: "0 4px 40px rgba(0,0,0,0.35)",
                  WebkitUserDrag: "none",
                } as React.CSSProperties}
              />
              {/* Scrim + CTA over the image only */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  borderRadius: "2px",
                  background:
                    "linear-gradient(to bottom, rgba(6,6,8,0.35) 0%, rgba(6,6,8,0.55) 100%)",
                }}
              >
                {playCta}
              </div>
            </div>
          </div>
        ) : (
          /* No cover: full-bleed cropped equirectangular (scale 1.6
             hides the distorted poles) + full-section play overlay. */
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
                background: "rgba(6,6,8,0.3)",
              }}
            >
              {playCta}
            </div>
          </>
        )
      )}

      {/* Active solo panorama */}
      {assetUrl && activated && PanoViewer && (
        <>
          <PanoViewer
            imageUrl={assetUrl}
            multires={
              section.file?.multires
                ? {
                    ...section.file.multires,
                    basePath: `/api/present/${data.accessToken}/tiles/${section.file.id}`,
                  }
                : null
            }
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
          startOnMap={!!data.tourStartOnMap}
          accentColor={data.clientAccentColor}
          companyName={data.project?.company || data.project?.name || null}
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
