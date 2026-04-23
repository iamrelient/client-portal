"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Maximize, Minimize } from "lucide-react";
import { TimelineNavigator } from "./chapter-menu";
import { ChapterStrip } from "./chapter-strip";
import { RayRendersLogo } from "@/components/ui/ray-renders-logo";
import { SectionHero } from "./section-hero";
import { SectionClosing } from "./section-closing";
import { SectionImage } from "./section-image";
import { SectionVideo } from "./section-video";
import { SectionText } from "./section-text";
import { SectionDivider } from "./section-divider";
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
  logoSize: string | null;
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
  /** For image sections with metadata.fileIds set, this is the full
   *  list of files resolved server-side so the carousel can render. */
  carouselFiles?: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[];
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
  const [model3DSnapshot, setModel3DSnapshot] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /* ---- Fullscreen toggle (uses browser Fullscreen API so the address
     bar and tabs disappear — real fullscreen, not just CSS) ---- */
  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Some browsers block fullscreen without a user gesture; the click
      // handler satisfies that so failures here are effectively silent.
    }
  }, []);

  /* ---- Expand image-section carousels into individual slides ----
     An image section with metadata.fileIds (or carouselFiles) holding 2+
     files is authored as a single "carousel section" in the editor. The
     viewer — which renders image sections through ChapterStrip's
     scroll-linked slide flow — needs one entry per image so each shows
     up as its own slide in the chapter. Each virtual section keeps the
     original section's chapter/title/transition but gets a synthetic id
     (origId__fileId) so React keys and navigation indexes stay unique. */
  const expandedSections = useMemo(() => {
    const out: SectionData[] = [];
    for (const s of data.sections) {
      const hasCarousel =
        s.type === "image" && s.carouselFiles && s.carouselFiles.length >= 2;
      if (hasCarousel) {
        for (const f of s.carouselFiles!) {
          out.push({
            ...s,
            id: `${s.id}__${f.id}`,
            fileId: f.id,
            file: f,
          });
        }
      } else {
        out.push(s);
      }
    }
    return out;
  }, [data.sections]);

  /* ---- Build segments from flat sections ---- */
  const segments = useMemo(
    () => buildSegments(expandedSections),
    [expandedSections]
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

  /* ---- Preload all images (including every carousel slide) ---- */
  useEffect(() => {
    expandedSections.forEach((section) => {
      if (
        section.file &&
        (section.type === "image" || section.type === "panorama")
      ) {
        const img = new Image();
        img.src = `/api/present/${data.accessToken}/asset/${section.file.id}`;
      }
    });
  }, [expandedSections, data.accessToken]);

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

  /* ---- Arrow-key navigation across the whole presentation ----
     Left / Right step through every expanded section in order, so the
     viewer can cruise from the hero all the way to the closing slide
     without scrolling. Ignored during walkthrough (panorama owns the
     keys there) or when the user is typing in a focusable field. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (walkthroughActive) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const last = expandedSections.length - 1;
      const next = Math.max(0, Math.min(last, scrollData.activeSectionIndex + dir));
      if (next !== scrollData.activeSectionIndex) {
        e.preventDefault();
        handleNavigate(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedSections.length, scrollData.activeSectionIndex, handleNavigate, walkthroughActive]);

  /* ---- Chapter-name navigation with fade-cut (for 3D model hotspots) ---- */
  const handleChapterNavigate = useCallback(
    (targetChapter: string) => {
      if (fadeCutActive) return;

      const targetIndex = expandedSections.findIndex(
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
    [expandedSections, handleNavigate, fadeCutActive]
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
                onSnapshot={seg.section.type === "3d-model" ? setModel3DSnapshot : undefined}
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
          sections={expandedSections}
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
          snapshotUrl={model3DSnapshot}
        />
      )}

      {/* Fullscreen toggle — hidden during walkthrough */}
      {!walkthroughActive && (
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </button>
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
  onSnapshot?: (dataUrl: string) => void;
}

function FullscreenSection({
  section,
  sectionIndex,
  data,
  fontsLoaded,
  onWalkthroughEnter,
  onWalkthroughExit,
  onChapterNavigate,
  onSnapshot,
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
          onSnapshot={onSnapshot}
        />
      );

    case "divider":
      return (
        <SectionDivider
          section={section}
          accentColor={data.clientAccentColor}
        />
      );

    default:
      return null;
  }
}
