"use client";

import { useEffect, useState, useRef, type RefObject } from "react";
import type { SectionData } from "./presentation-shell";

/* ------------------------------------------------------------------ */
/*  Segment types                                                      */
/* ------------------------------------------------------------------ */

export type Segment =
  | { kind: "fullscreen"; section: SectionData; sectionIndex: number }
  | {
      kind: "chapter";
      divider: SectionData | null;
      sections: { section: SectionData; sectionIndex: number }[];
    };

/* ------------------------------------------------------------------ */
/*  buildSegments — groups flat sections into fullscreen / chapter      */
/* ------------------------------------------------------------------ */

export function buildSegments(sections: SectionData[]): Segment[] {
  const segments: Segment[] = [];
  let pendingChapter: { section: SectionData; sectionIndex: number }[] = [];
  let pendingDivider: SectionData | null = null;
  let currentChapterName: string | null | undefined = undefined;

  const flushChapter = () => {
    if (pendingChapter.length > 0) {
      segments.push({
        kind: "chapter",
        divider: pendingDivider,
        sections: [...pendingChapter],
      });
      pendingChapter = [];
      pendingDivider = null;
    } else if (pendingDivider) {
      // Consecutive dividers or divider with no content — render as fullscreen
      segments.push({
        kind: "fullscreen",
        section: pendingDivider,
        sectionIndex: sections.indexOf(pendingDivider),
      });
      pendingDivider = null;
    }
    currentChapterName = undefined;
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    switch (section.type) {
      case "hero":
      case "closing":
      case "3d-model":
        flushChapter();
        segments.push({ kind: "fullscreen", section, sectionIndex: i });
        break;

      case "divider":
        flushChapter();
        pendingDivider = section;
        break;

      default: {
        // image, video, text, panorama — accumulate into chapter
        // If chapter name changes, flush and start new group
        const chapterName = section.chapter ?? null;
        if (currentChapterName !== undefined && chapterName !== currentChapterName) {
          flushChapter();
        }
        currentChapterName = chapterName;
        pendingChapter.push({ section, sectionIndex: i });
        break;
      }
    }
  }

  // Flush any remaining chapter
  flushChapter();

  return segments;
}

/* ------------------------------------------------------------------ */
/*  useScrollProgress — main hook                                      */
/* ------------------------------------------------------------------ */

export interface ScrollProgressData {
  overallProgress: number;
  activeSectionIndex: number;
  segmentProgresses: number[];
}

export function useScrollProgress(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  segments: Segment[]
): ScrollProgressData {
  const [data, setData] = useState<ScrollProgressData>({
    overallProgress: 0,
    activeSectionIndex: 0,
    segmentProgresses: segments.map(() => 0),
  });

  const tickingRef = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const compute = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const overallProgress =
        scrollHeight > 0 ? Math.max(0, Math.min(1, scrollTop / scrollHeight)) : 0;

      const vh = window.innerHeight;
      const segmentEls = container.querySelectorAll<HTMLElement>(
        "[data-segment-index]"
      );

      const segmentProgresses: number[] = [];
      let activeSectionIndex = 0;
      let bestVisibility = -Infinity;

      segmentEls.forEach((el) => {
        const idx = parseInt(el.dataset.segmentIndex || "0", 10);
        const segment = segments[idx];
        if (!segment) {
          segmentProgresses.push(0);
          return;
        }

        const rect = el.getBoundingClientRect();

        if (segment.kind === "fullscreen") {
          // How much of the viewport this segment covers
          const visibleTop = Math.max(0, rect.top);
          const visibleBottom = Math.min(vh, rect.bottom);
          const visibility = visibleBottom - visibleTop;

          segmentProgresses.push(rect.top <= 0 && rect.bottom >= vh ? 1 : 0);

          if (visibility > bestVisibility) {
            bestVisibility = visibility;
            activeSectionIndex = segment.sectionIndex;
          }
        } else {
          // Chapter strip
          const scrollable = rect.height - vh;
          let p = 0;
          if (scrollable > 0) {
            p = Math.max(0, Math.min(1, -rect.top / scrollable));
          } else {
            p = rect.top <= 0 ? 1 : 0;
          }
          segmentProgresses.push(p);

          // Check visibility
          const visibleTop = Math.max(0, rect.top);
          const visibleBottom = Math.min(vh, rect.bottom);
          const visibility = visibleBottom - visibleTop;

          if (visibility > bestVisibility) {
            bestVisibility = visibility;

            // Determine which section within the chapter is active
            const chapterSections = segment.sections;
            if (chapterSections.length === 0) {
              activeSectionIndex = 0;
            } else {
              // Calculate based on progress through the strip
              const sectionCount = chapterSections.length;
              const itemIndex = Math.min(
                Math.floor(p * sectionCount),
                sectionCount - 1
              );
              activeSectionIndex = chapterSections[Math.max(0, itemIndex)].sectionIndex;
            }
          }
        }
      });

      // Pad segmentProgresses if segments changed
      while (segmentProgresses.length < segments.length) {
        segmentProgresses.push(0);
      }

      setData({ overallProgress, activeSectionIndex, segmentProgresses });
      tickingRef.current = false;
    };

    const handleScroll = () => {
      if (!tickingRef.current) {
        tickingRef.current = true;
        requestAnimationFrame(compute);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    // Initial compute
    compute();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [scrollContainerRef, segments]);

  return data;
}
