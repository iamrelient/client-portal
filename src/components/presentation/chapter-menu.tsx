"use client";

import { memo, useMemo } from "react";
import type { SectionData } from "./presentation-shell";

/* ------------------------------------------------------------------ */
/*  Timeline Navigator                                                 */
/*  Bottom-docked timeline with dots, labels, and progress fill.       */
/*  Replaces the old pill-button ChapterMenu.                          */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  hero: "Intro",
  image: "Image",
  video: "Video",
  text: "Details",
  divider: "",
  closing: "Close",
  panorama: "360\u00B0",
};

interface TimelineNavigatorProps {
  sections: SectionData[];
  activeSectionIndex: number;
  overallProgress: number;
  onNavigate: (sectionIndex: number) => void;
}

export const TimelineNavigator = memo(function TimelineNavigator({
  sections,
  activeSectionIndex,
  overallProgress,
  onNavigate,
}: TimelineNavigatorProps) {
  // Build navigable sections (exclude dividers)
  const navigable = useMemo(
    () =>
      sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.type !== "divider"),
    [sections]
  );

  // Dot positions (evenly distributed 0-100%)
  const dotPositions = useMemo(() => {
    if (navigable.length <= 1) return [50];
    return navigable.map((_, i) => (i / (navigable.length - 1)) * 100);
  }, [navigable]);

  // Find current dot index
  const currentDotIndex = useMemo(() => {
    const idx = navigable.findIndex((n) => n.index === activeSectionIndex);
    // If active section is a divider, find the nearest navigable section
    if (idx === -1) {
      for (let i = navigable.length - 1; i >= 0; i--) {
        if (navigable[i].index <= activeSectionIndex) return i;
      }
      return 0;
    }
    return idx;
  }, [navigable, activeSectionIndex]);

  // Compute fill percentage based on dot position + inter-dot interpolation
  const fillPercent = useMemo(() => {
    if (navigable.length <= 1) return 0;
    const currentPos = dotPositions[currentDotIndex] || 0;
    const nextPos =
      currentDotIndex < dotPositions.length - 1
        ? dotPositions[currentDotIndex + 1]
        : 100;

    // Use overall progress to interpolate within the current section
    const progressPerDot = 1 / (navigable.length - 1);
    const dotProgress = currentDotIndex * progressPerDot;
    const intraProgress = Math.max(
      0,
      Math.min(1, (overallProgress - dotProgress) / progressPerDot)
    );

    return currentPos + intraProgress * (nextPos - currentPos);
  }, [dotPositions, currentDotIndex, overallProgress, navigable.length]);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40"
      style={{
        background: "rgba(6,6,8,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="relative mx-auto max-w-5xl px-10 pt-5 pb-7">
        {/* Background line */}
        <div
          className="absolute left-10 right-10 h-px"
          style={{ top: "20px", backgroundColor: "rgba(255,255,255,0.1)" }}
        />

        {/* Progress fill line */}
        <div
          className="absolute left-10 h-px transition-all duration-150 ease-out"
          style={{
            top: "20px",
            width: `${fillPercent}%`,
            maxWidth: "calc(100% - 80px)",
            backgroundColor: "rgba(255,255,255,0.6)",
          }}
        />

        {/* Dots and labels */}
        <div className="relative" style={{ height: "40px" }}>
          {navigable.map(({ section, index }, dotIdx) => {
            const isPast = index < activeSectionIndex;
            const isCurrent = index === activeSectionIndex;
            const isFuture = index > activeSectionIndex;
            const label =
              section.title || TYPE_LABELS[section.type] || section.type;

            return (
              <button
                key={section.id}
                onClick={() => onNavigate(index)}
                className="absolute flex flex-col items-center group"
                style={{
                  left: `${dotPositions[dotIdx]}%`,
                  transform: "translateX(-50%)",
                  top: 0,
                }}
              >
                {/* Dot */}
                <div
                  className="rounded-full transition-all duration-300 flex-shrink-0"
                  style={{
                    width: isCurrent ? 10 : 6,
                    height: isCurrent ? 10 : 6,
                    marginTop: isCurrent ? 15 : 17,
                    backgroundColor:
                      isCurrent || isPast
                        ? "rgba(255,255,255,0.9)"
                        : "transparent",
                    border: isFuture
                      ? "1.5px solid rgba(255,255,255,0.3)"
                      : "none",
                    boxShadow: isCurrent
                      ? "0 0 8px rgba(255,255,255,0.3)"
                      : "none",
                  }}
                />

                {/* Label */}
                <span
                  className="mt-1.5 font-light tracking-wide whitespace-nowrap transition-colors duration-300"
                  style={{
                    fontSize: "9px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase" as const,
                    color: isCurrent
                      ? "rgba(255,255,255,0.9)"
                      : "rgba(255,255,255,0.35)",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});
