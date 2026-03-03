"use client";

import { memo, useMemo } from "react";
import type { SectionData } from "./presentation-shell";

/* ------------------------------------------------------------------ */
/*  Chapter-aware Timeline Navigator                                    */
/*  Groups dots by chapter name with visual hierarchy.                  */
/* ------------------------------------------------------------------ */

interface ChapterGroup {
  name: string | null;
  items: { section: SectionData; index: number }[];
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
  overallProgress,
  onNavigate,
}: TimelineNavigatorProps) {
  // Build chapter groups from navigable sections (exclude hero, closing, divider)
  const chapterGroups = useMemo(() => {
    const groups: ChapterGroup[] = [];
    let current: ChapterGroup | null = null;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (
        section.type === "hero" ||
        section.type === "closing" ||
        section.type === "divider"
      ) {
        continue;
      }

      const chapterName = section.chapter ?? null;

      if (!current || current.name !== chapterName) {
        current = { name: chapterName, items: [] };
        groups.push(current);
      }

      current.items.push({ section, index: i });
    }

    return groups;
  }, [sections]);

  // Flatten all navigable items for progress calculation
  const allItems = useMemo(
    () => chapterGroups.flatMap((g) => g.items),
    [chapterGroups]
  );

  // Find which chapter group and item the active section is in
  const { activeGroupIdx, activeItemIdx, activeFlatIdx } = useMemo(() => {
    let flatIdx = 0;
    for (let gi = 0; gi < chapterGroups.length; gi++) {
      const group = chapterGroups[gi];
      for (let ii = 0; ii < group.items.length; ii++) {
        if (group.items[ii].index === activeSectionIndex) {
          return { activeGroupIdx: gi, activeItemIdx: ii, activeFlatIdx: flatIdx };
        }
        flatIdx++;
      }
    }

    // Active section is hero/closing/divider — find nearest navigable
    let bestGroupIdx = 0;
    let bestItemIdx = 0;
    let bestFlatIdx = 0;
    flatIdx = 0;
    for (let gi = 0; gi < chapterGroups.length; gi++) {
      const group = chapterGroups[gi];
      for (let ii = 0; ii < group.items.length; ii++) {
        if (group.items[ii].index <= activeSectionIndex) {
          bestGroupIdx = gi;
          bestItemIdx = ii;
          bestFlatIdx = flatIdx;
        }
        flatIdx++;
      }
    }
    return {
      activeGroupIdx: bestGroupIdx,
      activeItemIdx: bestItemIdx,
      activeFlatIdx: bestFlatIdx,
    };
  }, [chapterGroups, activeSectionIndex]);

  // Progress fill percentage
  const fillPercent = useMemo(() => {
    if (allItems.length <= 1) return 0;

    const basePercent = (activeFlatIdx / (allItems.length - 1)) * 100;

    // Interpolate within current position using overallProgress
    const progressPerItem = 1 / (allItems.length - 1);
    const itemProgress = activeFlatIdx * progressPerItem;
    const intraProgress = Math.max(
      0,
      Math.min(1, (overallProgress - itemProgress) / progressPerItem)
    );

    const nextPercent =
      activeFlatIdx < allItems.length - 1
        ? ((activeFlatIdx + 1) / (allItems.length - 1)) * 100
        : 100;

    return basePercent + intraProgress * (nextPercent - basePercent);
  }, [allItems.length, activeFlatIdx, overallProgress]);

  if (chapterGroups.length === 0) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40"
      style={{
        background: "rgba(6,6,8,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="relative mx-auto max-w-5xl px-10 pt-4 pb-5">
        {/* Background line */}
        <div
          className="absolute left-10 right-10 h-px"
          style={{ top: "16px", backgroundColor: "rgba(255,255,255,0.06)" }}
        />

        {/* Progress fill line */}
        <div
          className="absolute left-10 h-px transition-all duration-150 ease-out"
          style={{
            top: "16px",
            width: `${fillPercent}%`,
            maxWidth: "calc(100% - 80px)",
            backgroundColor: "rgba(255,255,255,0.25)",
          }}
        />

        {/* Chapter groups */}
        <div
          className="relative flex justify-between items-start"
          style={{ minHeight: "40px" }}
        >
          {chapterGroups.map((group, gi) => {
            const isCurrentChapter = gi === activeGroupIdx;
            const isPastChapter = gi < activeGroupIdx;

            return (
              <div
                key={`chapter-${gi}`}
                className="flex flex-col items-center"
                style={{ minWidth: 0 }}
              >
                {/* Chapter name label */}
                {group.name && (
                  <span
                    className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] block text-center"
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontWeight: 300,
                      color: isCurrentChapter
                        ? "rgba(255,255,255,0.55)"
                        : "rgba(255,255,255,0.35)",
                      marginBottom: "6px",
                      transition: "color 0.3s ease",
                    }}
                  >
                    {group.name}
                  </span>
                )}

                {/* Spacer when no label to keep dots aligned */}
                {!group.name && (
                  <div style={{ height: "6px", marginBottom: "6px" }} />
                )}

                {/* Dot row */}
                <div className="flex items-center" style={{ gap: "6px" }}>
                  {group.items.map((item, ii) => {
                    const isCurrent =
                      gi === activeGroupIdx && ii === activeItemIdx;
                    const isInCurrentChapter = isCurrentChapter;
                    const isPast =
                      isPastChapter ||
                      (isCurrentChapter && ii < activeItemIdx);

                    let dotSize: number;
                    let dotBg: string;
                    let dotShadow: string;

                    if (isCurrent) {
                      dotSize = 8;
                      dotBg = "rgba(255,255,255,0.6)";
                      dotShadow = "0 0 6px rgba(255,255,255,0.15)";
                    } else if (isInCurrentChapter) {
                      dotSize = 4;
                      dotBg = "rgba(255,255,255,0.3)";
                      dotShadow = "none";
                    } else if (isPast) {
                      dotSize = 4;
                      dotBg = "rgba(255,255,255,0.2)";
                      dotShadow = "none";
                    } else {
                      // Future
                      dotSize = 4;
                      dotBg = "rgba(255,255,255,0.08)";
                      dotShadow = "none";
                    }

                    return (
                      <button
                        key={item.section.id}
                        onClick={() => onNavigate(item.index)}
                        className="flex items-center justify-center"
                        style={{
                          width: "16px",
                          height: "16px",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        title={item.section.title || item.section.type}
                      >
                        <div
                          className="rounded-full transition-all duration-300"
                          style={{
                            width: dotSize,
                            height: dotSize,
                            backgroundColor: dotBg,
                            boxShadow: dotShadow,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
});
