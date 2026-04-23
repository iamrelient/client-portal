"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PresentationData, SectionData } from "./presentation-shell";

interface SectionImageProps {
  section: SectionData;
  data: PresentationData;
  previousTransition?: string | null;
}

const TRANSITIONS = ["fade", "wipe-left", "wipe-right", "scale", "parallax"] as const;

function pickTransition(
  configured: string | null,
  previousTransition?: string | null
): string {
  if (configured && TRANSITIONS.includes(configured as typeof TRANSITIONS[number])) {
    return configured;
  }
  // Auto-cycle: pick random, never same as previous
  const options = TRANSITIONS.filter((t) => t !== previousTransition);
  return options[Math.floor(Math.random() * options.length)];
}

// Randomize Ken Burns direction per instance
function getKenBurnsOrigin(): string {
  const origins = [
    "center center",
    "top left",
    "top right",
    "bottom left",
    "bottom right",
  ];
  return origins[Math.floor(Math.random() * origins.length)];
}

export function SectionImage({
  section,
  data,
  previousTransition,
}: SectionImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reduced, setReduced] = useState(false);
  const transitionRef = useRef(
    pickTransition(section.transitionStyle, previousTransition)
  );
  const kenBurnsOriginRef = useRef(getKenBurnsOrigin());

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Intersection Observer to trigger entrance
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Resolve the effective list of files: metadata.fileIds (carousel) wins
  // over section.file (single). If both are empty the section renders its
  // "No image assigned" placeholder.
  const files = useMemo(() => {
    if (section.carouselFiles && section.carouselFiles.length > 0) {
      return section.carouselFiles;
    }
    return section.file ? [section.file] : [];
  }, [section.carouselFiles, section.file]);
  const isCarousel = files.length > 1;

  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    // Reset when the underlying file list changes.
    setActiveIdx(0);
  }, [files]);

  const goNext = useCallback(() => {
    setActiveIdx((i) => (files.length ? (i + 1) % files.length : 0));
  }, [files.length]);
  const goPrev = useCallback(() => {
    setActiveIdx((i) =>
      files.length ? (i - 1 + files.length) % files.length : 0
    );
  }, [files.length]);

  // Touch swipe for mobile carousels.
  const touchStartXRef = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    if (!isCarousel || e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!isCarousel || touchStartXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(dx) > 50) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }

  const transition = transitionRef.current;
  const active = visible && loaded;
  const activeFile = files[activeIdx];
  const assetUrl = activeFile
    ? `/api/present/${data.accessToken}/asset/${activeFile.id}`
    : null;

  // Transition styles for the image wrapper
  const getTransitionStyles = (): React.CSSProperties => {
    if (reduced) {
      return {
        opacity: active ? 1 : 0,
        transition: "opacity 0.5s ease",
      };
    }

    switch (transition) {
      case "fade":
        return {
          opacity: active ? 1 : 0,
          transition: "opacity 1s cubic-bezier(0.25,0.1,0.25,1)",
        };

      case "wipe-left":
        return {
          clipPath: active
            ? "inset(0 0 0 0)"
            : "inset(0 0 0 100%)",
          transition: "clip-path 1.2s cubic-bezier(0.25,0.1,0.25,1)",
        };

      case "wipe-right":
        return {
          clipPath: active
            ? "inset(0 0 0 0)"
            : "inset(0 100% 0 0)",
          transition: "clip-path 1.2s cubic-bezier(0.25,0.1,0.25,1)",
        };

      case "scale":
        return {
          opacity: active ? 1 : 0,
          filter: active ? "blur(0px)" : "blur(8px)",
          transform: active ? "scale(1)" : "scale(1.15)",
          transition:
            "opacity 1s cubic-bezier(0.25,0.1,0.25,1), filter 1.2s cubic-bezier(0.25,0.1,0.25,1), transform 1.2s cubic-bezier(0.25,0.1,0.25,1)",
        };

      case "parallax":
        return {
          opacity: active ? 1 : 0,
          transform: active ? "translateY(0)" : "translateY(100px)",
          transition:
            "opacity 1s cubic-bezier(0.25,0.1,0.25,1), transform 1.2s cubic-bezier(0.25,0.1,0.25,1)",
        };

      default:
        return {
          opacity: active ? 1 : 0,
          transition: "opacity 1s ease",
        };
    }
  };

  return (
    <div
      ref={ref}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: "#060608",
        overflow: "hidden",
      }}
    >
      {assetUrl && (
        <>
          {/* Image wrapper with entrance transition — keyed on the active
             file so the entrance animation re-runs on slide changes. */}
          <div
            key={activeFile?.id}
            style={{
              position: "absolute",
              inset: 0,
              willChange: "transform, opacity",
              ...getTransitionStyles(),
            }}
          >
            {/* Image with Ken Burns */}
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
                transformOrigin: kenBurnsOriginRef.current,
                transform: active && !reduced ? "scale(1)" : "scale(1.05)",
                transition: reduced
                  ? "none"
                  : "transform 10s linear",
                willChange: "transform",
              } as React.CSSProperties}
            />
          </div>

          {/* Transparent interactive layer above image to block interactions */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
            }}
          />

          {/* Carousel controls (prev/next buttons + slide dots) */}
          {isCarousel && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous image"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "clamp(0.75rem, 2vw, 1.5rem)",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(6,6,8,0.45)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: active ? 0.85 : 0,
                  transition: reduced ? "none" : "opacity 0.6s ease",
                }}
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next image"
                style={{
                  position: "absolute",
                  top: "50%",
                  right: "clamp(0.75rem, 2vw, 1.5rem)",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(6,6,8,0.45)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: active ? 0.85 : 0,
                  transition: reduced ? "none" : "opacity 0.6s ease",
                }}
              >
                <ChevronRight size={22} />
              </button>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "clamp(1rem, 2vw, 1.5rem)",
                  zIndex: 3,
                  display: "flex",
                  justifyContent: "center",
                  gap: 6,
                  pointerEvents: "none",
                  opacity: active ? 1 : 0,
                  transition: reduced ? "none" : "opacity 0.6s ease",
                }}
              >
                {files.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    aria-label={`Go to image ${i + 1}`}
                    style={{
                      pointerEvents: "auto",
                      width: i === activeIdx ? 24 : 8,
                      height: 8,
                      borderRadius: 9999,
                      border: "none",
                      background:
                        i === activeIdx
                          ? "rgba(255,255,255,0.9)"
                          : "rgba(255,255,255,0.35)",
                      cursor: "pointer",
                      padding: 0,
                      transition: reduced ? "none" : "width 0.4s ease, background 0.4s ease",
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  position: "absolute",
                  right: "clamp(1rem, 2vw, 1.5rem)",
                  top: "clamp(1rem, 2vw, 1.5rem)",
                  zIndex: 3,
                  padding: "0.25rem 0.6rem",
                  borderRadius: 9999,
                  background: "rgba(6,6,8,0.45)",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  fontSize: "0.75rem",
                  color: "rgba(255,255,255,0.8)",
                  letterSpacing: "0.05em",
                  opacity: active ? 1 : 0,
                  transition: reduced ? "none" : "opacity 0.6s ease",
                }}
              >
                {activeIdx + 1} / {files.length}
              </div>
            </>
          )}

          {/* Caption overlay */}
          {(section.title || section.description) && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 2,
                background:
                  "linear-gradient(to top, rgba(6,6,8,0.4) 0%, transparent 100%)",
                padding: "3rem clamp(1rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2.5rem)",
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(8px)",
                transition: reduced
                  ? "none"
                  : "opacity 0.8s ease 0.5s, transform 0.8s ease 0.5s",
              }}
            >
              {section.title && (
                <h2
                  style={{
                    fontSize: "clamp(1.125rem, 2vw, 1.5rem)",
                    fontWeight: 300,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "#fff",
                    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                    marginBottom: section.description ? "0.5rem" : 0,
                  }}
                >
                  {section.title}
                </h2>
              )}
              {section.description && (
                <p
                  style={{
                    fontSize: "clamp(0.8125rem, 1.2vw, 1rem)",
                    fontWeight: 300,
                    color: "rgba(255,255,255,0.8)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    lineHeight: 1.5,
                    maxWidth: 600,
                  }}
                >
                  {section.description}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* No-file fallback */}
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
          No image assigned
        </div>
      )}
    </div>
  );
}
