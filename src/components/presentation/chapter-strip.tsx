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

  // Active image is now local state (not scroll-driven). Scrolling no
  // longer steps through every image — the strip catches briefly then
  // lets you scroll past. Images are browsed via the thumbnail track
  // and a gentle auto-advance. `progress` is intentionally unused now.
  void progress;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Keep the index valid if the section set shrinks.
  useEffect(() => {
    if (activeIndex > totalItems - 1) setActiveIndex(0);
  }, [totalItems, activeIndex]);

  // Auto-advance only when the whole strip is images (a gallery) —
  // mixed strips (a video/panorama in the chapter) stay manual so we
  // don't skip past playing media. Pauses on hover.
  const allImages = useMemo(
    () =>
      sections.length > 0 &&
      sections.every((s) => s.section.type === "image"),
    [sections]
  );
  useEffect(() => {
    if (!allImages || totalItems <= 1 || paused) return;
    const t = setInterval(() => {
      setActiveIndex((i) => (i + 1) % totalItems);
    }, 5000);
    return () => clearInterval(t);
  }, [allImages, totalItems, paused]);

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

  // Spacer height — exactly one viewport. The carousel scrolls past
  // like any normal section (no snap/catch — that felt awkward).
  // Images are browsed via the thumbnail track + auto-advance, not
  // by scrolling.
  const spacerHeight = vh > 0 ? vh : "100vh";

  // Selecting an image is now just local state — no container scroll.
  const navigateToItem = useCallback((itemIndex: number) => {
    setActiveIndex(itemIndex);
  }, []);

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
        // No scroll-snap on the carousel — it scrolls past freely.
      }}
    >
      <div
        className="sticky top-0 h-screen w-screen overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          // Space theme: let the starfield show through behind the
          // carousel. A faint translucent scrim keeps image contrast
          // without hiding the stars. Light theme keeps the original
          // solid near-black so images pop on a neutral stage.
          backgroundColor:
            data.theme === "space" ? "rgba(6,6,8,0.2)" : "#060608",
        }}
      >
        {/* Image hero view.

            Layout uses three deterministic zones so the carousel fits
            ANY screen and stays consistent room-to-room:
              • Title row    — fixed height (clamp), always reserved.
              • Image area   — flex:1, object-fit contain. Because the
                               rows around it are fixed-height, this box
                               is identical on every room (so a single-
                               image room and a multi-image room show the
                               same image size).
              • Bottom row   — fixed height for caption + thumbnails,
                               always reserved (even single-image rooms)
                               so the image size doesn't jump around.
            paddingBottom clears the page's FIXED timeline nav at the
            bottom of the viewport, so thumbnails never hide under it. */}
        {isActiveImage && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              height: "100%",
              boxSizing: "border-box",
              paddingTop: "clamp(0.6rem, 2vh, 1.25rem)",
              paddingLeft: "clamp(16px, 5vw, 60px)",
              paddingRight: "clamp(16px, 5vw, 60px)",
              // Clear the fixed bottom timeline navigator (~75px) so the
              // thumbnail strip always sits above it.
              paddingBottom: "clamp(72px, 9vh, 92px)",
            }}
          >
            {/* Chapter title — fixed-height row so the image area below
                is the same size on every room. */}
            <div
              style={{
                height: "clamp(30px, 5vh, 52px)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "0 2rem",
                textAlign: "center",
              }}
            >
              {chapterTitle && (
                <h2
                  style={{
                    fontSize: "clamp(0.8rem, 1.8vw, 1.15rem)",
                    fontWeight: 300,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.7)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}
                >
                  {chapterTitle}
                </h2>
              )}
            </div>

            {/* Hero image — cross-fade between adjacent images.
                min-height: 0 is essential: without it a flex child
                won't shrink below its image's intrinsic size, which
                pushed the caption + thumbnails off the bottom of the
                viewport. */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Fixed 16:9 frame. Without this, object-fit:contain sized
                  each image to its own aspect ratio, so a render that's
                  even slightly off 16:9 came out a different size than the
                  others ("Conference is larger"). Pinning a 16:9 frame —
                  capped by the available width AND height — makes every
                  carousel image occupy an identical footprint on every
                  screen, regardless of the source's exact dimensions.
                  On wide screens the frame is a true 16:9; on narrow ones
                  it's bounded by the area but still identical room-to-room.
                  Images use object-fit:contain so they're never cropped or
                  stretched. */}
              <div
                ref={heroContainerRef}
                data-clickable
                style={{
                  position: "relative",
                  height: "100%",
                  aspectRatio: "16 / 9",
                  maxWidth: "100%",
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
                        inset: 0,
                        width: "100%",
                        height: "100%",
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
            </div>

            {/* Bottom row — caption + thumbnails. Fixed height, always
                reserved (even on single-image rooms) so the image area
                above stays the same size across the whole tour. */}
            <div
              style={{
                flexShrink: 0,
                width: "100%",
                height: "clamp(70px, 10vh, 96px)",
                marginTop: "0.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
            {/* Image caption — aligned with image left edge */}
            {activeSection?.title && (
              <p
                style={{
                  alignSelf: "flex-start",
                  marginLeft: imageLeftOffset > 0 ? `${imageLeftOffset}px` : 0,
                  fontSize: "0.8rem",
                  fontWeight: 300,
                  letterSpacing: "0.03em",
                  color: "rgba(255,255,255,0.55)",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
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
                  overflowX: "auto",
                  maxWidth: "100%",
                  justifyContent: "center",
                  padding: "2px 0",
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
          </div>
        )}

        {/* Non-image section — full viewport */}
        {!isActiveImage && activeSection && (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {/* Panoramas (the 360° tour) are a self-contained immersive
                experience with their own cover + chrome — a floating
                chapter title over them ("Lobby") just clutters the cover,
                so suppress it here. Video/text sections still get it. */}
            {chapterTitle && activeSection.type !== "panorama" && (
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
