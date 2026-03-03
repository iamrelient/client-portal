"use client";

import { useEffect, useState, memo } from "react";
import { useScrollManager } from "./scroll-manager";
import { ProgressIndicator } from "./progress-indicator";
import { SectionHero } from "./section-hero";
import { SectionImage } from "./section-image";
import { SectionVideo } from "./section-video";
import { SectionText } from "./section-text";
import { SectionDivider } from "./section-divider";
import { SectionClosing } from "./section-closing";
import { SectionPanorama } from "./section-panorama";
import { WatermarkOverlay } from "./watermark-overlay";
import { PresentationCursor } from "./presentation-cursor";

export interface PresentationData {
  id: string;
  title: string | null;
  subtitle: string | null;
  clientLogo: string | null;
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
  transitionStyle: string | null;
  metadata: Record<string, unknown> | null;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
}

interface PresentationShellProps {
  data: PresentationData;
  viewerName?: string;
}

export function PresentationShell({ data, viewerName }: PresentationShellProps) {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const { progress, currentSection, containerRef } = useScrollManager(
    data.sections.length
  );

  // Load presentation fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400&family=Inter:wght@300;400&display=swap";
    document.head.appendChild(link);

    // Wait for fonts to be ready
    if (document.fonts) {
      document.fonts.ready.then(() => setFontsLoaded(true));
    } else {
      // Fallback: assume loaded after a short delay
      setTimeout(() => setFontsLoaded(true), 500);
    }

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Disable right-click
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // Log access
  useEffect(() => {
    fetch(`/api/present/${data.accessToken}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerName }),
    }).catch(() => {});
  }, [data.accessToken, viewerName]);

  return (
    <div
      className="presentation-shell"
      style={{
        fontFamily: "'Inter Tight', 'Inter', sans-serif",
        backgroundColor: "#060608",
        color: "rgba(255,255,255,0.9)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <style>{`
        .presentation-shell {
          position: fixed;
          inset: 0;
          overflow: hidden;
        }
        .presentation-scroll {
          height: 100%;
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        .presentation-section {
          height: 100svh;
          scroll-snap-align: start;
          position: relative;
          overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
          .presentation-scroll {
            scroll-behavior: auto;
          }
        }
      `}</style>

      <div ref={containerRef} className="presentation-scroll">
        {data.sections.map((section, index) => {
          // Find the previous image section's transition for auto-cycling
          const prevImageSection = data.sections
            .slice(0, index)
            .reverse()
            .find((s) => s.type === "image");

          // Lazy mount: only render sections within ±2 of the current view
          // Always render hero (0) and the first content section (1)
          const shouldMount =
            index <= 1 ||
            Math.abs(index - currentSection) <= 2;

          return (
            <div key={section.id} className="presentation-section">
              {shouldMount ? (
                <MemoizedSectionRenderer
                  section={section}
                  index={index}
                  currentSection={currentSection}
                  data={data}
                  fontsLoaded={fontsLoaded}
                  viewerName={viewerName}
                  previousTransition={prevImageSection?.transitionStyle}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <ProgressIndicator progress={progress} />
      <WatermarkOverlay
        enabled={data.watermarkEnabled}
        viewerName={viewerName}
      />
      <PresentationCursor />
    </div>
  );
}

interface SectionRendererProps {
  section: SectionData;
  index: number;
  currentSection: number;
  data: PresentationData;
  fontsLoaded: boolean;
  viewerName?: string;
  previousTransition?: string | null;
}

const MemoizedSectionRenderer = memo(function SectionRenderer(props: SectionRendererProps) {
  const { section, data, fontsLoaded, previousTransition } = props;
  // Each section component handles its own visibility via IntersectionObserver
  switch (section.type) {
    case "hero":
      return <SectionHero data={data} fontsLoaded={fontsLoaded} />;

    case "image":
      return (
        <SectionImage
          section={section}
          data={data}
          previousTransition={previousTransition}
        />
      );

    case "video":
      return <SectionVideo section={section} data={data} />;

    case "panorama":
      return <SectionPanorama section={section} data={data} />;

    case "text":
      return <SectionText section={section} data={data} />;

    case "divider":
      return <SectionDivider section={section} />;

    case "closing":
      return <SectionClosing data={data} />;

    default:
      return null;
  }
});
