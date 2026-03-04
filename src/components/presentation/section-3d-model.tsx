"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import type { PresentationData, SectionData } from "./presentation-shell";
import type { Model3DMetadata, PreviewHotspot } from "@/types/model3d";
import { get3DFormat } from "@/lib/model-utils";
import { Model3DPreviewCard } from "./model-3d-preview-card";

/* ------------------------------------------------------------------ */
/*  Lazy-loaded 3D canvas — only imported when the section is visible  */
/* ------------------------------------------------------------------ */

const Model3DCanvas = dynamic(() => import("./model-3d-canvas"), {
  ssr: false,
  loading: () => <LoadingSpinner />,
});

/* ------------------------------------------------------------------ */
/*  Loading spinner                                                    */
/* ------------------------------------------------------------------ */

function LoadingSpinner() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "2px solid rgba(255,255,255,0.1)",
          borderTopColor: "rgba(255,255,255,0.4)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section3DModel — fullscreen 3D model viewer                        */
/* ------------------------------------------------------------------ */

interface Section3DModelProps {
  section: SectionData;
  data: PresentationData;
  onNavigate?: (targetChapter: string) => void;
}

export function Section3DModel({ section, data, onNavigate }: Section3DModelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [activePreview, setActivePreview] = useState<PreviewHotspot | null>(null);

  // Detect reduced motion + touch device
  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    setIsTouch(
      "ontouchstart" in window || navigator.maxTouchPoints > 0
    );
  }, []);

  // Lazy activation via IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleHotspotNavigate = useCallback(
    (targetChapter: string) => {
      onNavigate?.(targetChapter);
    },
    [onNavigate]
  );

  const handlePreviewClick = useCallback(
    (hotspot: PreviewHotspot) => {
      setActivePreview(hotspot);
    },
    []
  );

  const handlePreviewClose = useCallback(() => {
    setActivePreview(null);
  }, []);

  if (!section.file) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#060608",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "0.875rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          No 3D model attached
        </p>
      </div>
    );
  }

  const url = `/api/present/${data.accessToken}/asset/${section.file.id}`;
  const format = get3DFormat(section.file.originalName);
  const metadata = (section.metadata || {}) as Model3DMetadata;
  const hotspots = metadata.hotspots || [];

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: "#060608",
        overflow: "hidden",
      }}
    >
      {/* Chapter / section title overlay */}
      {section.title && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            textAlign: "center",
            padding: "clamp(1rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <h2
            style={{
              fontSize: "clamp(0.75rem, 1.8vw, 1.15rem)",
              fontWeight: 300,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {section.title}
          </h2>
        </div>
      )}

      {/* 3D Canvas — only rendered after visibility trigger */}
      {visible && format && (
        <Suspense fallback={<LoadingSpinner />}>
          <Model3DCanvas
            url={url}
            format={format}
            cameraPosition={metadata.cameraPosition}
            cameraTarget={metadata.cameraTarget}
            autoRotateSpeed={reduced ? 0 : (metadata.autoRotateSpeed ?? 0.5)}
            hotspots={hotspots}
            onHotspotNavigate={handleHotspotNavigate}
            onHotspotPreviewClick={handlePreviewClick}
          />
        </Suspense>
      )}

      {/* Interaction hint — touch-aware copy */}
      <div
        style={{
          position: "absolute",
          bottom: isTouch ? "4rem" : "6rem",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          zIndex: 5,
          opacity: visible ? 1 : 0,
          transition: "opacity 1s ease 1.5s",
        }}
      >
        <p
          style={{
            fontSize: "clamp(0.5625rem, 1.2vw, 0.6875rem)",
            fontWeight: 300,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
            whiteSpace: "nowrap",
          }}
        >
          {isTouch
            ? "Drag to rotate \u00B7 Pinch to zoom"
            : "Drag to orbit \u00B7 Scroll to zoom"}
        </p>
      </div>

      {/* Preview card overlay */}
      {activePreview && (
        <Model3DPreviewCard
          hotspot={activePreview}
          accessToken={data.accessToken}
          onClose={handlePreviewClose}
          onNavigate={handleHotspotNavigate}
        />
      )}
    </div>
  );
}
