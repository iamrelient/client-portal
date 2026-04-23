"use client";

import { useEffect, useState, useMemo, useCallback, useRef, memo } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";
import { SectionVideo } from "./section-video";
import { SectionText } from "./section-text";
import { SectionPanorama } from "./section-panorama";
import { ImageLightbox } from "./image-lightbox";

/* ------------------------------------------------------------------ */
/*  ChapterStrip — Hero & Track Gallery                                */
/*  One large hero image + thumbnail strip, scroll-driven switching    */
/* ------------------------------------------------------------------ */

interface ChapterStripProps {
  segmentIndex: number;
  divider: SectionData | null;
  sections: { section: SectionData; sectionIndex: number }[];
  data: PresentationData;
  progress: number;
  onWalkthroughEnter?: () => void;
  onWalkthroughExit?: () => void;
}

export const ChapterStrip = memo(function ChapterStrip({
  segmentIndex,
  divider,
  sections,
  data,
  progress,
  onWalkthroughEnter,
  onWalkthroughExit,
}: ChapterStripProps) {
  const [vh, setVh] = useState(0);
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const [imageLeftOffset, setImageLeftOffset] = useState(0);

  // Measure viewport height
  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const totalItems = sections.length;

  // Active index from scroll progress
  const activeIndex = useMemo(() => {
    if (totalItems === 0) return 0;
    const idx = Math.floor(progress * totalItems);
    return Math.max(0, Math.min(idx, totalItems - 1));
  }, [progress, totalItems]);

  const activeSection = sections[activeIndex]?.section;
  const isActiveImage = activeSection?.type === "image";

  // Image entries with their global index for thumbnail track
  const imageEntries = useMemo(
    () =>
      sections
        .map((s, idx) => ({ ...s, globalIdx: idx }))
        .filter((s) => s.section.type === "image"),
    [sections]
  );

  // Chapter title: use divider title, or fall back to the chapter field on sections
  const chapterTitle =
    divider?.title || sections[0]?.section.chapter || null;

  // Spacer height: one viewport per section
  const spacerHeight =
    vh > 0 ? totalItems * vh : `${totalItems * 100}vh`;

  // Navigate to a specific item index by scrolling the parent container
  const navigateToItem = useCallback(
    (itemIndex: number) => {
      const segmentEl = document.querySelector(
        `[data-segment-index="${segmentIndex}"]`
      ) as HTMLElement;
      if (!segmentEl?.parentElement) return;

      const container = segmentEl.parentElement;
      const scrollable =
        segmentEl.getBoundingClientRect().height - window.innerHeight;
      const targetProgress =
        totalItems > 1 ? itemIndex / (totalItems - 1) : 0;

      container.scrollTo({
        top: segmentEl.offsetTop + targetProgress * Math.max(0, scrollable),
        behavior: "smooth",
      });
    },
    [segmentIndex, totalItems]
  );

  // Arrow-key navigation is handled globally in PresentationShell so it
  // can walk through every section — across chapter boundaries and into
  // fullscreen sections (hero, closing, 3D). The per-chapter handler
  // that used to live here would have fought the global one.
  void navigateToItem;

  // Measure rendered image left offset within hero container
  const measureImageOffset = useCallback((img: HTMLImageElement | null) => {
    if (!img || !heroContainerRef.current) return;
    const containerRect = heroContainerRef.current.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setImageLeftOffset(imgRect.left - containerRect.left);
  }, []);

  return (
    <div
      data-segment-index={segmentIndex}
      style={{
        height:
          typeof spacerHeight === "number"
            ? `${spacerHeight}px`
            : spacerHeight,
        position: "relative",
      }}
    >
      <div
        className="sticky top-0 h-screen w-screen overflow-hidden"
        style={{ backgroundColor: "#060608" }}
      >
        {/* Image hero view */}
        {isActiveImage && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              height: "100%",
              padding: "0 60px 80px",
            }}
          >
            {/* Chapter title — above image */}
            {chapterTitle && (
              <div
                style={{
                  textAlign: "center",
                  padding: "1.5rem 2rem 0.5rem",
                  flexShrink: 0,
                }}
              >
                <h2
                  style={{
                    fontSize: "clamp(0.85rem, 1.8vw, 1.15rem)",
                    fontWeight: 300,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {chapterTitle}
                </h2>
              </div>
            )}

            {/* Hero image — cross-fade between adjacent images */}
            <div
              ref={heroContainerRef}
              data-clickable
              style={{
                position: "relative",
                flex: 1,
                width: "100%",
                maxWidth: "calc(100vw - 120px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              onClick={() =>
                activeSection?.id && setLightboxImageId(activeSection.id)
              }
            >
              {sections.map(({ section }, idx) => {
                if (section.type !== "image" || !section.file) return null;
                const isActive = idx === activeIndex;
                // Only render current ±1 for performance
                if (Math.abs(idx - activeIndex) > 1) return null;

                const url = `/api/present/${data.accessToken}/asset/${section.file.id}`;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={section.id}
                    src={url}
                    alt={section.title || ""}
                    draggable={false}
                    ref={isActive ? measureImageOffset : undefined}
                    onLoad={isActive ? (e) => measureImageOffset(e.currentTarget) : undefined}
                    style={{
                      position: "absolute",
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: "2px",
                      boxShadow: "0 4px 40px rgba(0,0,0,0.15)",
                      opacity: isActive ? 1 : 0,
                      transition: "opacity 0.5s ease",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  />
                );
              })}
            </div>

            {/* Image caption — below image, aligned with image left edge */}
            {activeSection?.title && (
              <p
                style={{
                  alignSelf: "flex-start",
                  marginTop: "0.5rem",
                  marginLeft: imageLeftOffset > 0 ? `${imageLeftOffset}px` : 0,
                  fontSize: "0.8rem",
                  fontWeight: 300,
                  letterSpacing: "0.03em",
                  color: "rgba(255,255,255,0.55)",
                  flexShrink: 0,
                  transition: "margin-left 0.3s ease",
                }}
              >
                {activeSection.title}
              </p>
            )}

            {/* Thumbnail track */}
            {imageEntries.length > 1 && (
              <div
                className="scrollbar-hide"
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "0.5rem",
                  overflowX: "auto",
                  maxWidth: "calc(100vw - 120px)",
                  justifyContent: "center",
                  padding: "4px 0",
                }}
              >
                {imageEntries.map(({ section, globalIdx }) => {
                  if (!section.file) return null;
                  const url = `/api/present/${data.accessToken}/asset/${section.file.id}`;
                  const isThumbActive = globalIdx === activeIndex;

                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={section.id}
                      src={url}
                      alt={section.title || ""}
                      draggable={false}
                      data-clickable
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToItem(globalIdx);
                      }}
                      style={{
                        width: "80px",
                        height: "50px",
                        objectFit: "cover",
                        borderRadius: "3px",
                        flexShrink: 0,
                        cursor: "pointer",
                        opacity: isThumbActive ? 1 : 0.4,
                        outline: isThumbActive
                          ? "2px solid rgba(255,255,255,0.3)"
                          : "2px solid transparent",
                        outlineOffset: "2px",
                        transition:
                          "opacity 0.3s ease, outline-color 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isThumbActive)
                          e.currentTarget.style.opacity = "0.7";
                      }}
                      onMouseLeave={(e) => {
                        if (!isThumbActive)
                          e.currentTarget.style.opacity = "0.4";
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Non-image section — full viewport */}
        {!isActiveImage && activeSection && (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {chapterTitle && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  padding: "2rem 2rem",
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              >
                <h2
                  style={{
                    fontSize: "clamp(0.85rem, 1.8vw, 1.15rem)",
                    fontWeight: 300,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {chapterTitle}
                </h2>
              </div>
            )}
            {activeSection.type === "video" && (
              <SectionVideo section={activeSection} data={data} />
            )}
            {activeSection.type === "text" && (
              <SectionText section={activeSection} data={data} />
            )}
            {activeSection.type === "panorama" && (
              <SectionPanorama
                section={activeSection}
                data={data}
                onWalkthroughEnter={onWalkthroughEnter}
                onWalkthroughExit={onWalkthroughExit}
              />
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImageId && (
        <ImageLightbox
          sections={sections.map((s) => s.section)}
          activeImageId={lightboxImageId}
          data={data}
          onClose={() => setLightboxImageId(null)}
        />
      )}
    </div>
  );
});
