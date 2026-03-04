"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { TimelineNavigator } from "./chapter-menu";
import { ChapterStrip } from "./chapter-strip";
import { RayRendersLogo } from "@/components/ui/ray-renders-logo";
import { SectionHero } from "./section-hero";
import { SectionClosing } from "./section-closing";
import { SectionImage } from "./section-image";
import { SectionVideo } from "./section-video";
import { SectionText } from "./section-text";
import { SectionPanorama } from "./section-panorama";
import { Section3DModel } from "./section-3d-model";
import { PresentationCursor } from "./presentation-cursor";
import { Model3DPiP } from "./model-3d-pip";
import {
  buildSegments,
  useScrollProgress,
} from "./use-scroll-progress";

/* ------------------------------------------------------------------ */
/*  Data interfaces — unchanged                                        */
/* ------------------------------------------------------------------ */

export interface PresentationData {
  id: string;
  title: string | null;
  subtitle: string | null;
  clientLogo: string | null;
  logoDisplay: string | null;
  clientAccentColor: string | null;
  watermarkEnabled: boolean;
  accessToken: string;
  project: { id: string; name: string; company: string | null };
  sections: SectionData[];
}

export interface SectionData {
  id: string;
  type: string;
  order: number;
  fileId: string | null;
  title: string | null;
  description: string | null;
  chapter: string | null;
  transitionStyle: string | null;
  metadata: Record<string, unknown> | null;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
}

/* ------------------------------------------------------------------ */
/*  Helper — previous transition for SectionImage                      */
/* ------------------------------------------------------------------ */

function getPreviousTransition(
  sections: SectionData[],
  index: number
): string | null {
  const prev = sections
    .slice(0, index)
    .reverse()
    .find((s) => s.type === "image");
  return prev?.transitionStyle ?? null;
}

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */

interface PresentationShellProps {
  data: PresentationData;
  viewerName?: string;
}

export function PresentationShell({
  data,
  viewerName,
}: PresentationShellProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [fadeCutActive, setFadeCutActive] = useState(false);

  /* ---- Build segments from flat sections ---- */
  const segments = useMemo(
    () => buildSegments(data.sections),
    [data.sections]
  );

  /* ---- Scroll progress tracking ---- */
  const scrollData = useScrollProgress(scrollContainerRef, segments);

  /* ---- Font loading ---- */
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400&family=Inter:wght@300;400&display=swap";
    document.head.appendChild(link);

    if (document.fonts) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
      setTimeout(() => setFontsLoaded(true), 500);
    }

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  /* ---- Right-click prevention ---- */
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  /* ---- Log access ---- */
  useEffect(() => {
    fetch(`/api/present/${data.accessToken}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerName }),
    }).catch(() => {});
  }, [data.accessToken, viewerName]);

  /* ---- Preload all images ---- */
  useEffect(() => {
    data.sections.forEach((section) => {
      if (
        section.file &&
        (section.type === "image" || section.type === "panorama")
      ) {
        const img = new Image();
        img.src = `/api/present/${data.accessToken}/asset/${section.file.id}`;
      }
    });
  }, [data.sections, data.accessToken]);

  /* ---- Navigate to section by flat index (scroll-based) ---- */
  const handleNavigate = useCallback(
    (targetSectionIndex: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find which segment contains this section index
      let targetSegIdx = -1;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (
          seg.kind === "fullscreen" &&
          seg.sectionIndex === targetSectionIndex
        ) {
          targetSegIdx = i;
          break;
        }
        if (
          seg.kind === "chapter" &&
          seg.sections.some((s) => s.sectionIndex === targetSectionIndex)
        ) {
          targetSegIdx = i;
          break;
        }
      }

      if (targetSegIdx === -1) return;

      const segmentEl = container.querySelector<HTMLElement>(
        `[data-segment-index="${targetSegIdx}"]`
      );
      if (!segmentEl) return;

      const segment = segments[targetSegIdx];

      if (segment.kind === "fullscreen") {
        segmentEl.scrollIntoView({ behavior });
      } else {
        // Chapter strip — compute scroll offset for the target item
        const itemIdx = segment.sections.findIndex(
          (s) => s.sectionIndex === targetSectionIndex
        );
        if (itemIdx === -1) {
          segmentEl.scrollIntoView({ behavior });
          return;
        }

        // Scroll to segment top + proportional offset within the strip
        const totalItems = segment.sections.length;
        const targetProgress =
          totalItems > 1 ? itemIdx / (totalItems - 1) : 0;

        const spacerHeight = segmentEl.getBoundingClientRect().height;
        const scrollable = spacerHeight - window.innerHeight;
        const offsetTop = segmentEl.offsetTop;

        container.scrollTo({
          top: offsetTop + targetProgress * Math.max(0, scrollable),
          behavior,
        });
      }
    },
    [segments]
  );

  /* ---- Chapter-name navigation with fade-cut (for 3D model hotspots) ---- */
  const handleChapterNavigate = useCallback(
    (targetChapter: string) => {
      if (fadeCutActive) return;

      const targetIndex = data.sections.findIndex(
        (s) => s.chapter === targetChapter
      );
      if (targetIndex === -1) return;

      // Phase 1: Fade to black
      setFadeCutActive(true);

      // Phase 2: After fade-in completes, jump-scroll while hidden
      setTimeout(() => {
        handleNavigate(targetIndex, "auto");

        // Phase 3: Fade back in after a brief hold
        requestAnimationFrame(() => {
          setFadeCutActive(false);
        });
      }, 350);
    },
    [data.sections, handleNavigate, fadeCutActive]
  );

  /* ---- Render ---- */
  return (
    <div
      ref={scrollContainerRef}
      className="presentation-shell fixed inset-0 overflow-y-auto overflow-x-hidden bg-neutral-50 select-none scrollbar-hide"
      style={{ fontFamily: "'Inter Tight', 'Inter', sans-serif" }}
    >
      {segments.map((seg, i) => {
        if (seg.kind === "fullscreen") {
          return (
            <div
              key={`seg-${i}`}
              data-segment-index={i}
              className="relative w-screen"
              style={{ height: "100vh" }}
            >
              <FullscreenSection
                section={seg.section}
                sectionIndex={seg.sectionIndex}
                data={data}
                fontsLoaded={fontsLoaded}
                onWalkthroughEnter={() => setWalkthroughActive(true)}
                onWalkthroughExit={() => setWalkthroughActive(false)}
                onChapterNavigate={handleChapterNavigate}
              />
            </div>
          );
        }

        return (
          <ChapterStrip
            key={`seg-${i}`}
            segmentIndex={i}
            divider={seg.divider}
            sections={seg.sections}
            data={data}
            progress={scrollData.segmentProgresses[i] ?? 0}
            onWalkthroughEnter={() => setWalkthroughActive(true)}
            onWalkthroughExit={() => setWalkthroughActive(false)}
          />
        );
      })}

      {/* Branding — hidden during walkthrough */}
      {!walkthroughActive && (
        <RayRendersLogo className="fixed top-6 left-6 w-48 text-neutral-900 opacity-40 z-50 pointer-events-none" />
      )}

      {/* Timeline navigator — hidden during walkthrough */}
      {!walkthroughActive && (
        <TimelineNavigator
          sections={data.sections}
          activeSectionIndex={scrollData.activeSectionIndex}
          overallProgress={scrollData.overallProgress}
          onNavigate={handleNavigate}
        />
      )}

      {/* PiP floor plan widget — hidden during walkthrough */}
      {!walkthroughActive && (
        <Model3DPiP
          segments={segments}
          activeSectionIndex={scrollData.activeSectionIndex}
          onNavigate={handleNavigate}
        />
      )}

      {/* Fade-cut transition overlay (3D model hotspot navigation) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 999,
          backgroundColor: "#060608",
          opacity: fadeCutActive ? 1 : 0,
          transition: "opacity 0.35s ease",
          pointerEvents: fadeCutActive ? "auto" : "none",
          willChange: fadeCutActive ? "opacity" : "auto",
        }}
      />

      {/* Custom cursor — desktop only */}
      <PresentationCursor />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FullscreenSection — renders a single section at full viewport       */
/* ------------------------------------------------------------------ */

interface FullscreenSectionProps {
  section: SectionData;
  sectionIndex: number;
  data: PresentationData;
  fontsLoaded: boolean;
  onWalkthroughEnter: () => void;
  onWalkthroughExit: () => void;
  onChapterNavigate: (targetChapter: string) => void;
}

function FullscreenSection({
  section,
  sectionIndex,
  data,
  fontsLoaded,
  onWalkthroughEnter,
  onWalkthroughExit,
  onChapterNavigate,
}: FullscreenSectionProps) {
  switch (section.type) {
    case "hero":
      return <SectionHero data={data} fontsLoaded={fontsLoaded} />;

    case "closing":
      return <SectionClosing data={data} />;

    case "image":
      return (
        <SectionImage
          section={section}
          data={data}
          previousTransition={getPreviousTransition(
            data.sections,
            sectionIndex
          )}
        />
      );

    case "video":
      return <SectionVideo section={section} data={data} />;

    case "text":
      return <SectionText section={section} data={data} />;

    case "panorama":
      return (
        <SectionPanorama
          section={section}
          data={data}
          onWalkthroughEnter={onWalkthroughEnter}
          onWalkthroughExit={onWalkthroughExit}
        />
      );

    case "3d-model":
      return (
        <Section3DModel
          section={section}
          data={data}
          onNavigate={onChapterNavigate}
        />
      );

    case "divider":
      // Standalone divider (edge case: consecutive dividers with no content)
      return (
        <div className="h-full flex items-center justify-center bg-neutral-50">
          {section.title && (
            <h2 className="text-neutral-900 text-center px-8 text-2xl md:text-4xl lg:text-5xl font-light tracking-[0.12em] uppercase leading-tight animate-slide-up-fade">
              {section.title}
            </h2>
          )}
        </div>
      );

    default:
      return null;
  }
}
