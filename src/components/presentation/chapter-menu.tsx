"use client";

import { memo, useMemo } from "react";
import type { SectionData } from "./presentation-shell";

/* ------------------------------------------------------------------ */
/*  Wayfinding Timeline Navigator                                       */
/*  One dot per chapter. Labels always visible. Progress line + ring.   */
/* ------------------------------------------------------------------ */

interface TimelineDot {
  label: string;
  navigateToIndex: number;
  kind: "intro" | "chapter" | "closing";
  /** All flat section indices belonging to this dot */
  sectionIndices: number[];
}

interface TimelineNavigatorProps {
  sections: SectionData[];
  activeSectionIndex: number;
  overallProgress: number;
  onNavigate: (sectionIndex: number) => void;
}

export const TimelineNavigator = memo(function TimelineNavigator({
  sections,
  activeSectionIndex,
  onNavigate,
}: TimelineNavigatorProps) {
  /* ---- Build one dot per chapter ---- */
  const dots = useMemo(() => {
    const result: TimelineDot[] = [];
    let currentChapterName: string | null | undefined = undefined;
    let currentDot: TimelineDot | null = null;

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];

      if (s.type === "hero") {
        result.push({
          label: "Intro",
          navigateToIndex: i,
          kind: "intro",
          sectionIndices: [i],
        });
        continue;
      }

      if (s.type === "3d-model") {
        // Flush any pending chapter
        if (currentDot) {
          currentDot = null;
          currentChapterName = undefined;
        }
        result.push({
          label: s.title || "Floor Plan",
          navigateToIndex: i,
          kind: "chapter",
          sectionIndices: [i],
        });
        continue;
      }

      if (s.type === "closing") {
        // Flush any pending chapter
        if (currentDot) {
          currentDot = null;
          currentChapterName = undefined;
        }
        result.push({
          label: "Close",
          navigateToIndex: i,
          kind: "closing",
          sectionIndices: [i],
        });
        continue;
      }

      if (s.type === "divider") {
        // Dividers flush the current chapter but don't get their own dot
        if (currentDot) {
          currentDot = null;
          currentChapterName = undefined;
        }
        continue;
      }

      // Content section — group by chapter name
      const chapterName = s.chapter ?? null;

      if (currentDot && chapterName === currentChapterName) {
        // Same chapter — add to current dot
        currentDot.sectionIndices.push(i);
      } else {
        // New chapter — flush previous and start new dot
        const label = chapterName || "Gallery";
        currentDot = {
          label,
          navigateToIndex: i,
          kind: "chapter",
          sectionIndices: [i],
        };
        currentChapterName = chapterName;
        result.push(currentDot);
      }
    }

    return result;
  }, [sections]);

  /* ---- Find active dot + intra-chapter progress ---- */
  const { activeDotIdx, intraProgress } = useMemo(() => {
    // Find which dot owns the activeSectionIndex
    for (let di = dots.length - 1; di >= 0; di--) {
      const dot = dots[di];
      const idx = dot.sectionIndices.indexOf(activeSectionIndex);
      if (idx !== -1) {
        const total = dot.sectionIndices.length;
        const progress = total <= 1 ? 0 : idx / (total - 1);
        return { activeDotIdx: di, intraProgress: progress };
      }
    }

    // activeSectionIndex is a divider or between dots — find nearest preceding
    for (let di = dots.length - 1; di >= 0; di--) {
      const dot = dots[di];
      if (dot.navigateToIndex <= activeSectionIndex) {
        return { activeDotIdx: di, intraProgress: 1 };
      }
    }

    return { activeDotIdx: 0, intraProgress: 0 };
  }, [dots, activeSectionIndex]);

  /* ---- Progress fill percentage ---- */
  const fillPercent = useMemo(() => {
    if (dots.length <= 1) return 0;
    const basePct = (activeDotIdx / (dots.length - 1)) * 100;
    const stepPct = (1 / (dots.length - 1)) * 100;
    return basePct + intraProgress * stepPct;
  }, [dots.length, activeDotIdx, intraProgress]);

  if (dots.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40"
      style={{
        background: "rgba(6,6,8,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="relative mx-auto max-w-4xl px-12 pt-5 pb-6">
        <div className="relative">
          {/* Re-draw progress fill inside this container for accurate width */}
          <div
            className="absolute h-px transition-all duration-200 ease-out"
            style={{
              top: "8px",
              left: 0,
              width: `${fillPercent}%`,
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          />
          <div
            className="absolute h-px w-full"
            style={{
              top: "8px",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          />

          {/* Dots */}
          <div
            className="relative flex justify-between items-start"
            style={{ minHeight: "36px" }}
          >
            {dots.map((dot, di) => {
              const isCurrent = di === activeDotIdx;
              const isPast = di < activeDotIdx;

              const dotSize = isCurrent ? 7 : 5;
              const dotColor = isCurrent
                ? "rgba(255,255,255,0.7)"
                : isPast
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(255,255,255,0.12)";
              const labelColor = isCurrent
                ? "rgba(255,255,255,0.5)"
                : "rgba(255,255,255,0.25)";

              return (
                <button
                  key={`dot-${di}`}
                  onClick={() => onNavigate(dot.navigateToIndex)}
                  className="flex flex-col items-center group"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    minWidth: "40px",
                  }}
                >
                  {/* Dot + progress ring */}
                  <div
                    className="relative flex items-center justify-center"
                    style={{ width: "16px", height: "16px" }}
                  >
                    {/* Intra-chapter progress ring (only on current dot) */}
                    {isCurrent && dot.sectionIndices.length > 1 && (
                      <div
                        className="absolute rounded-full transition-all duration-300"
                        style={{
                          width: "14px",
                          height: "14px",
                          background: `conic-gradient(
                            rgba(255,255,255,0.12) ${intraProgress * 360}deg,
                            transparent ${intraProgress * 360}deg
                          )`,
                          mask: "radial-gradient(circle at center, transparent 4.5px, black 5px)",
                          WebkitMask:
                            "radial-gradient(circle at center, transparent 4.5px, black 5px)",
                        }}
                      />
                    )}

                    {/* Dot */}
                    <div
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: dotSize,
                        height: dotSize,
                        backgroundColor: dotColor,
                        boxShadow: isCurrent
                          ? "0 0 6px rgba(255,255,255,0.1)"
                          : "none",
                      }}
                    />
                  </div>

                  {/* Label */}
                  <span
                    className="transition-colors duration-300"
                    style={{
                      fontSize: "0.6rem",
                      fontWeight: 300,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: labelColor,
                      marginTop: "5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dot.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
});
