"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";

interface SectionTextProps {
  section: SectionData;
  data: PresentationData;
}

export function SectionText({ section, data }: SectionTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const accentColor = data.clientAccentColor || null;

  // Find the next image section after this text section
  const nextImageFile = useMemo(() => {
    const sorted = [...data.sections].sort((a, b) => a.order - b.order);
    const thisIdx = sorted.findIndex((s) => s.id === section.id);
    if (thisIdx === -1) return null;
    const next = sorted.slice(thisIdx + 1).find(
      (s) => s.type === "image" && s.file
    );
    return next?.file ?? null;
  }, [data.sections, section.id]);

  const bgUrl = nextImageFile
    ? `/api/present/${data.accessToken}/asset/${nextImageFile.id}`
    : null;

  // Split description into lines for staggered animation
  const lines = section.description
    ? section.description.split("\n").filter((l) => l.trim())
    : [];

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#060608",
        padding: "0 clamp(1rem, 4vw, 2rem)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Blurred preview of next image */}
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scale(1.1)",
            filter: "blur(40px) brightness(0.5)",
            opacity: 0.6,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        style={{
          maxWidth: 700,
          width: "100%",
          position: "relative",
          paddingLeft: accentColor ? "1.5rem" : 0,
          zIndex: 1,
        }}
      >
        {/* Accent line on the left */}
        {accentColor && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: accentColor,
              opacity: visible ? 0.6 : 0,
              transition: reduced ? "none" : "opacity 0.8s ease",
            }}
          />
        )}

        {/* Title */}
        {section.title && (
          <h2
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
              fontWeight: 300,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.9)",
              marginBottom: "1.5rem",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(2rem)",
              transition: reduced
                ? "none"
                : "opacity 0.8s cubic-bezier(0.25,0.1,0.25,1), transform 0.8s cubic-bezier(0.25,0.1,0.25,1)",
            }}
          >
            {section.title}
          </h2>
        )}

        {/* Description — line by line stagger */}
        {lines.length > 0 && (
          <div>
            {lines.map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: "clamp(1rem, 1.3vw, 1.25rem)",
                  fontWeight: 400,
                  color: "#b0b0b0",
                  lineHeight: 1.7,
                  marginBottom: "0.75em",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateX(0)" : "translateX(2rem)",
                  transition: reduced
                    ? "none"
                    : `opacity 0.8s cubic-bezier(0.25,0.1,0.25,1) ${(i + 1) * 120}ms, transform 0.8s cubic-bezier(0.25,0.1,0.25,1) ${(i + 1) * 120}ms`,
                }}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        {/* Single paragraph fallback if no newlines */}
        {section.description && lines.length === 0 && (
          <p
            style={{
              fontSize: "clamp(1rem, 1.3vw, 1.25rem)",
              fontWeight: 400,
              color: "#b0b0b0",
              lineHeight: 1.7,
              opacity: visible ? 1 : 0,
              transform: visible ? "translateX(0)" : "translateX(2rem)",
              transition: reduced
                ? "none"
                : "opacity 0.8s cubic-bezier(0.25,0.1,0.25,1) 120ms, transform 0.8s cubic-bezier(0.25,0.1,0.25,1) 120ms",
            }}
          >
            {section.description}
          </p>
        )}
      </div>
    </div>
  );
}
