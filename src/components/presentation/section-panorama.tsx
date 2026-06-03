"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";
import type { PanoramaMetadata } from "@/types/panorama";

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

  /** Set of panorama section ids that should travel together as one
   *  walkthrough. Two sources are merged:
   *    1. Explicit tour group — any panorama whose metadata.tourGroupId
   *       matches this section's tourGroupId.
   *    2. Navigation graph — BFS from this section across every
   *       navigation hotspot's targetSectionId. So a "To Lobby" hotspot
   *       implicitly pulls the Lobby into the same walkthrough, with
   *       zero manual configuration. The graph is transitive: if Lobby
   *       links to Conference, Conference comes along too.
   *
   *  Solo mode (no walkthrough) only when the set is just this section. */
  const reachablePanoramaIds = useMemo(() => {
    const reachable = new Set<string>([section.id]);
    const sectionsById = new Map(data.sections.map((s) => [s.id, s]));

    // Explicit tour group siblings.
    const tourGroupId = metadata.tourGroupId;
    if (tourGroupId) {
      for (const s of data.sections) {
        if (
          s.type === "panorama" &&
          s.metadata &&
          (s.metadata as PanoramaMetadata).tourGroupId === tourGroupId
        ) {
          reachable.add(s.id);
        }
      }
    }

    // BFS through navigation hotspots, starting from this section's set.
    const queue: string[] = Array.from(reachable);
    while (queue.length) {
      const id = queue.shift()!;
      const s = sectionsById.get(id);
      if (!s) continue;
      const meta = (s.metadata || {}) as PanoramaMetadata;
      for (const h of meta.hotspots ?? []) {
        if (h.type !== "navigation") continue;
        const target = sectionsById.get(h.targetSectionId);
        if (
          target?.type === "panorama" &&
          !reachable.has(h.targetSectionId)
        ) {
          reachable.add(h.targetSectionId);
          queue.push(h.targetSectionId);
        }
      }
    }
    return reachable;
  }, [section.id, metadata.tourGroupId, data.sections]);

  const handleActivate = useCallback(() => {
    // If this panorama is connected to others (explicit tour group OR
    // wired via navigation hotspots), launch the walkthrough so clicks
    // on hotspots switch scenes in-place. Otherwise stay in solo mode.
    if (reachablePanoramaIds.size > 1) {
      import("./panorama-walkthrough").then((mod) => {
        setWalkthroughComponent(() => mod.PanoramaWalkthrough);
        setWalkthroughActive(true);
        onWalkthroughEnter?.();
      });
      return;
    }
    setActivated(true);
  }, [reachablePanoramaIds, onWalkthroughEnter]);

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

  // Build room data for walkthrough — use the same reachable set
  // computed above so navigation-linked rooms come along even without
  // an explicit tour group.
  const tourRooms = walkthroughActive
    ? data.sections
        .filter(
          (s) =>
            s.type === "panorama" &&
            s.file &&
            reachablePanoramaIds.has(s.id)
        )
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          sectionId: s.id,
          imageUrl: `/api/present/${data.accessToken}/asset/${s.file!.id}`,
          metadata: (s.metadata || {}) as PanoramaMetadata,
        }))
    : [];

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
          {/* Static preview image */}
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
              pointerEvents: "none",
              WebkitUserDrag: "none",
              opacity: visible ? 1 : 0,
              transition: reduced ? "none" : "opacity 0.8s ease",
            } as React.CSSProperties}
          />

          {/* Explore prompt overlay */}
          <div
            onClick={handleActivate}
            data-cursor-label="Explore"
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
                gap: "1rem",
              }}
            >
              {/* 360 icon */}
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="1"
                />
                <ellipse
                  cx="24"
                  cy="24"
                  rx="12"
                  ry="22"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="0.5"
                />
                <line
                  x1="2"
                  y1="24"
                  x2="46"
                  y2="24"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="0.5"
                />
              </svg>

              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 300,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Explore in 360&deg;
              </span>
            </div>
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
