"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";

interface SectionPanoramaProps {
  section: SectionData;
  data: PresentationData;
}

export function SectionPanorama({ section, data }: SectionPanoramaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [PanoViewer, setPanoViewer] = useState<typeof import("./panorama-viewer").PanoramaViewer | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Observe visibility
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

  // Dynamically import panorama viewer when approaching viewport
  useEffect(() => {
    if (!visible) return;

    import("./panorama-viewer").then((mod) => {
      setPanoViewer(() => mod.PanoramaViewer);
    });
  }, [visible]);

  const handleActivate = useCallback(() => {
    setActivated(true);
  }, []);

  const handleExit = useCallback(() => {
    setActivated(false);
  }, []);

  const assetUrl = section.file
    ? `/api/present/${data.accessToken}/asset/${section.file.id}`
    : null;

  const metadata = section.metadata as {
    hotspots?: { pitch: number; yaw: number; label: string; targetSectionId: string }[];
    initialView?: { pitch: number; yaw: number };
  } | null;

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: "#060608",
        overflow: "hidden",
      }}
    >
      {assetUrl && !activated && (
        <>
          {/* Static preview image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl}
            alt={section.title || "360° panorama"}
            loading="lazy"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              WebkitUserDrag: "none",
              opacity: visible ? 1 : 0,
              transition: reduced ? "none" : "opacity 0.8s ease",
            } as React.CSSProperties}
          />

          {/* Explore prompt overlay */}
          <div
            onClick={handleActivate}
            data-cursor-label="Explore"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              zIndex: 2,
              cursor: "pointer",
              background: "rgba(6,6,8,0.3)",
            }}
          >
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: reduced
                  ? "none"
                  : "opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              {/* 360 icon */}
              <svg
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
              >
                <circle
                  cx="24"
                  cy="24"
                  r="22"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="1"
                />
                <ellipse
                  cx="24"
                  cy="24"
                  rx="12"
                  ry="22"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="0.5"
                />
                <line
                  x1="2"
                  y1="24"
                  x2="46"
                  y2="24"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="0.5"
                />
              </svg>

              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 300,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Explore in 360&deg;
              </span>
            </div>
          </div>
        </>
      )}

      {/* Active panorama */}
      {assetUrl && activated && PanoViewer && (
        <>
          <PanoViewer
            imageUrl={assetUrl}
            initialView={metadata?.initialView}
            hotspots={metadata?.hotspots}
          />

          {/* Exit button */}
          <button
            onClick={handleExit}
            data-cursor-label="Exit"
            style={{
              position: "absolute",
              top: "1.5rem",
              right: "1.5rem",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              border: "none",
              cursor: "pointer",
              zIndex: 10,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="2" y1="2" x2="12" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
              <line x1="12" y1="2" x2="2" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
            </svg>
          </button>
        </>
      )}

      {/* No file fallback */}
      {!assetUrl && (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontSize: "0.875rem",
          }}
        >
          No panorama assigned
        </div>
      )}
    </div>
  );
}
