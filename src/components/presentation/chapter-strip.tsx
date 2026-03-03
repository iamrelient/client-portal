"use client";

import { useEffect, useRef, useState, useMemo, memo } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";
import { SectionVideo } from "./section-video";
import { SectionText } from "./section-text";
import { SectionPanorama } from "./section-panorama";
import {
  COLLAGE_SIZES,
  getCollageSize,
  getVerticalOffset,
} from "./use-scroll-progress";

/* ------------------------------------------------------------------ */
/*  Gap between collage items (px)                                     */
/* ------------------------------------------------------------------ */

const GAP = 16;

/* ------------------------------------------------------------------ */
/*  ChapterStrip                                                       */
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
  const [dimensions, setDimensions] = useState({ vw: 0, vh: 0 });

  // Measure viewport on mount and resize
  useEffect(() => {
    const update = () => {
      setDimensions({
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Count images for sizing
  const imageCount = sections.filter(
    (s) => s.section.type === "image"
  ).length;

  // Calculate item widths and total content width
  const { spacerHeight, horizontalTravel } = useMemo(() => {
    if (dimensions.vw === 0) {
      return { totalContentWidth: 0, spacerHeight: 0, horizontalTravel: 0 };
    }

    const vw = dimensions.vw / 100;
    const vh = dimensions.vh;

    let totalW = 0;
    let imageIdx = 0;

    // Divider card
    if (divider) {
      totalW += dimensions.vw; // 100vw
      totalW += GAP;
    }

    // Content sections
    sections.forEach(({ section }) => {
      if (section.type === "image") {
        const size = getCollageSize(imageIdx, imageCount);
        const numericVw = parseFloat(COLLAGE_SIZES[size].width);
        totalW += numericVw * vw;
        imageIdx++;
      } else if (
        section.type === "video" ||
        section.type === "panorama"
      ) {
        totalW += dimensions.vw; // 100vw
      } else if (section.type === "text") {
        totalW += 70 * vw; // 70vw
      } else {
        totalW += dimensions.vw;
      }
      totalW += GAP;
    });

    // Remove trailing gap
    if (sections.length > 0 || divider) {
      totalW -= GAP;
    }

    // Add padding on both sides
    totalW += 64; // 32px each side

    const travel = Math.max(0, totalW - dimensions.vw);
    const spacerVh = Math.max(1, Math.ceil(travel / vh) + 1);
    const spacerH = spacerVh * vh;

    return {
      totalContentWidth: totalW,
      spacerHeight: spacerH,
      horizontalTravel: travel,
    };
  }, [dimensions, sections, divider, imageCount]);

  // Calculate translateX from progress
  const translateX = progress * horizontalTravel;

  // If no horizontal travel needed, just render at viewport height
  const effectiveSpacerHeight =
    horizontalTravel <= 0 ? dimensions.vh || "100vh" : spacerHeight;

  return (
    <div
      data-segment-index={segmentIndex}
      style={{
        height:
          typeof effectiveSpacerHeight === "number"
            ? `${effectiveSpacerHeight}px`
            : effectiveSpacerHeight,
        position: "relative",
      }}
    >
      <div className="sticky top-0 h-screen w-screen overflow-hidden">
        <div
          className="flex items-center h-full"
          style={{
            gap: `${GAP}px`,
            padding: "32px",
            transform: `translateX(${-translateX}px)`,
            willChange: "transform",
          }}
        >
          {/* Divider title card */}
          {divider && <DividerCard divider={divider} />}

          {/* Content items */}
          {sections.map(({ section, sectionIndex }, idx) => {
            if (section.type === "image") {
              const imageIdx = sections
                .slice(0, idx)
                .filter((s) => s.section.type === "image").length;

              return (
                <CollageItem
                  key={section.id}
                  section={section}
                  sectionIndex={sectionIndex}
                  data={data}
                  indexInChapter={imageIdx}
                  totalImages={imageCount}
                />
              );
            }

            // Non-image sections: render existing components in sized containers
            return (
              <NonImageItem
                key={section.id}
                section={section}
                sectionIndex={sectionIndex}
                data={data}
                onWalkthroughEnter={onWalkthroughEnter}
                onWalkthroughExit={onWalkthroughExit}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  DividerCard — chapter title in the horizontal strip                */
/* ------------------------------------------------------------------ */

function DividerCard({ divider }: { divider: SectionData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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

  return (
    <div
      ref={ref}
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: "100vw",
        height: "calc(100vh - 64px)",
        backgroundColor: "#060608",
        borderRadius: "4px",
      }}
    >
      {divider.title && (
        <h2
          className={`
            text-white text-center px-8
            text-2xl md:text-4xl lg:text-5xl
            font-light tracking-[0.12em] uppercase leading-tight
            transition-all duration-700
            ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}
          `}
        >
          {divider.title}
        </h2>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CollageItem — image at varied size                                 */
/* ------------------------------------------------------------------ */

interface CollageItemProps {
  section: SectionData;
  sectionIndex: number;
  data: PresentationData;
  indexInChapter: number;
  totalImages: number;
}

function CollageItem({
  section,
  data,
  indexInChapter,
  totalImages,
}: CollageItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const size = getCollageSize(indexInChapter, totalImages);
  const sizeValues = COLLAGE_SIZES[size];
  const verticalOffset = getVerticalOffset(indexInChapter);

  const assetUrl = section.file
    ? `/api/present/${data.accessToken}/asset/${section.file.id}`
    : null;

  const active = visible && loaded;

  return (
    <div
      ref={ref}
      className="flex-shrink-0 relative overflow-hidden"
      style={{
        width: sizeValues.width,
        height: sizeValues.height,
        marginTop: verticalOffset,
        borderRadius: "2px",
      }}
      data-section-id={section.id}
    >
      {assetUrl && (
        <>
          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl}
            alt={section.title || ""}
            loading="lazy"
            draggable={false}
            onLoad={() => setLoaded(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              WebkitUserDrag: "none",
              opacity: active ? 1 : 0,
              transform: active ? "scale(1)" : "scale(1.03)",
              transition: "opacity 0.6s ease, transform 0.8s ease",
            } as React.CSSProperties}
          />

          {/* Interactive blocker */}
          <div className="absolute inset-0 z-[1]" />

          {/* Caption overlay */}
          {section.title && active && (
            <div
              className="absolute bottom-0 inset-x-0 z-[2] px-4 pb-4 pt-12"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
                opacity: active ? 1 : 0,
                transition: "opacity 0.5s ease 0.3s",
              }}
            >
              <p className="text-white text-sm font-light tracking-wide">
                {section.title}
              </p>
              {section.description && (
                <p className="text-white/70 text-xs font-light mt-1 line-clamp-2">
                  {section.description}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* No-file fallback */}
      {!assetUrl && (
        <div className="h-full flex items-center justify-center bg-neutral-200 text-neutral-500 text-sm">
          No image assigned
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NonImageItem — wraps existing section components in sized container */
/* ------------------------------------------------------------------ */

interface NonImageItemProps {
  section: SectionData;
  sectionIndex: number;
  data: PresentationData;
  onWalkthroughEnter?: () => void;
  onWalkthroughExit?: () => void;
}

function NonImageItem({
  section,
  data,
  onWalkthroughEnter,
  onWalkthroughExit,
}: NonImageItemProps) {
  const width =
    section.type === "text" ? "70vw" : "100vw";

  return (
    <div
      className="flex-shrink-0 relative overflow-hidden"
      style={{
        width,
        height: "calc(100vh - 64px)",
        borderRadius: "2px",
      }}
      data-section-id={section.id}
    >
      {section.type === "video" && (
        <SectionVideo section={section} data={data} />
      )}
      {section.type === "text" && (
        <SectionText section={section} data={data} />
      )}
      {section.type === "panorama" && (
        <SectionPanorama
          section={section}
          data={data}
          onWalkthroughEnter={onWalkthroughEnter}
          onWalkthroughExit={onWalkthroughExit}
        />
      )}
    </div>
  );
}
