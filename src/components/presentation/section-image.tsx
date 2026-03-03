"use client";

import { useEffect, useRef, useState } from "react";
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

  const transition = transitionRef.current;
  const active = visible && loaded;
  const assetUrl = section.file
    ? `/api/present/${data.accessToken}/asset/${section.file.id}`
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
          {/* Image wrapper with entrance transition */}
          <div
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
