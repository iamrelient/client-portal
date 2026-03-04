"use client";

import { useEffect, useState, useRef } from "react";
import type { PresentationData } from "./presentation-shell";
import { LogoShelf } from "./logo-shelf";

interface SectionHeroProps {
  data: PresentationData;
  fontsLoaded: boolean;
}

export function SectionHero({ data, fontsLoaded }: SectionHeroProps) {
  const [beat, setBeat] = useState(0);
  const started = useRef(false);
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  // Start the opening sequence once fonts are loaded
  useEffect(() => {
    if (!fontsLoaded || started.current) return;
    started.current = true;

    if (prefersReduced.current) {
      // Skip sequence — show everything immediately
      setBeat(6);
      return;
    }

    // Beat 1: background image fades in from black (0–1s)
    setBeat(1);

    const timers = [
      setTimeout(() => setBeat(2), 1000),   // Beat 2: client logo (1s)
      setTimeout(() => setBeat(3), 2200),   // Beat 3: title (2.2s)
      setTimeout(() => setBeat(4), 3500),   // Beat 4: line (3.5s)
      setTimeout(() => setBeat(5), 4200),   // Beat 5: subtitle + scroll indicator (4.2s)
      setTimeout(() => setBeat(6), 5000),   // Beat 6: complete (5s)
    ];

    return () => timers.forEach(clearTimeout);
  }, [fontsLoaded]);

  const title = data.title || data.project.name;
  const words = title.split(/\s+/);
  const hasLogo = !!data.clientLogo;
  const reduced = prefersReduced.current;

  // Beat 2 is logo — if no logo, beats 2+ shift to show title at beat 2 timing
  const logoVisible = hasLogo && beat >= 2;
  const titleVisible = hasLogo ? beat >= 3 : beat >= 2;
  const lineVisible = hasLogo ? beat >= 4 : beat >= 3;
  const subtitleVisible = hasLogo ? beat >= 5 : beat >= 4;
  const scrollVisible = hasLogo ? beat >= 5 : beat >= 4;
  const brandVisible = hasLogo ? beat >= 3 : beat >= 2;

  // Resolve background image: explicit hero file → first image section fallback
  const heroSection = data.sections.find((s) => s.type === "hero");
  const bgFile =
    heroSection?.file ||
    data.sections.find((s) => s.type === "image" && s.file)?.file;
  const bgUrl = bgFile
    ? `/api/present/${data.accessToken}/asset/${bgFile.id}`
    : null;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        position: "relative",
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      {/* Background image with gradient overlay */}
      {bgUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: beat >= 1 ? 1 : 0,
              transition: reduced ? "none" : "opacity 1.5s ease",
              pointerEvents: "none",
            }}
          />
          {/* Dark gradient overlay for text legibility */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.7) 100%)",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* Solid fallback when no background image */}
      {!bgUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: beat >= 1 ? "#060608" : "#000000",
            transition: reduced ? "none" : "background-color 1s ease",
          }}
        />
      )}

      {/* Beat 2: Client logo */}
      {hasLogo && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            opacity: logoVisible ? 1 : 0,
            transform: logoVisible ? "scale(1)" : "scale(0.97)",
            transition: reduced
              ? "none"
              : "opacity 1.2s cubic-bezier(0.25,0.1,0.25,1), transform 1.2s cubic-bezier(0.25,0.1,0.25,1)",
            marginBottom: "2.5rem",
          }}
        >
          <LogoShelf
            src={`/api/present/${data.accessToken}/asset/${data.clientLogo}`}
            mode={(data.logoDisplay as "auto" | "white" | "light-bg") || "auto"}
            height="clamp(40px, 6vw, 72px)"
          />
        </div>
      )}

      {/* Beat 3: Title — each word staggers in */}
      <h1
        style={{
          position: "relative",
          zIndex: 1,
          fontSize: "clamp(2rem, 5vw, 4rem)",
          fontWeight: 300,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          textAlign: "center",
          padding: "0 clamp(1rem, 4vw, 2rem)",
          lineHeight: 1.2,
        }}
      >
        {words.map((word, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: titleVisible ? 1 : 0,
              transform: titleVisible ? "translateY(0)" : "translateY(12px)",
              transition: reduced
                ? "none"
                : `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 150}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${i * 150}ms`,
              marginRight: "0.3em",
            }}
          >
            {word}
          </span>
        ))}
      </h1>

      {/* Beat 4: Horizontal line extending from center */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "30%",
          height: 1,
          marginTop: "2rem",
          marginBottom: "2rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.4)",
            left: lineVisible ? "0%" : "50%",
            right: lineVisible ? "0%" : "50%",
            transition: reduced
              ? "none"
              : "left 0.7s cubic-bezier(0.16,1,0.3,1), right 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>

      {/* Beat 5: Subtitle */}
      {data.subtitle && (
        <p
          style={{
            position: "relative",
            zIndex: 1,
            fontSize: "clamp(0.875rem, 1.5vw, 1.25rem)",
            fontWeight: 300,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
            padding: "0 clamp(1rem, 4vw, 2rem)",
            opacity: subtitleVisible ? 1 : 0,
            transform: subtitleVisible ? "translateY(0)" : "translateY(8px)",
            transition: reduced
              ? "none"
              : "opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {data.subtitle}
        </p>
      )}

      {/* Beat 5: Scroll indicator */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          bottom: "2.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          opacity: scrollVisible ? 1 : 0,
          transition: reduced ? "none" : "opacity 0.8s ease",
        }}
      >
        <svg
          width="20"
          height="28"
          viewBox="0 0 20 28"
          fill="none"
          style={{
            animation: reduced ? "none" : "hero-bob 2s ease-in-out infinite",
          }}
        >
          <path
            d="M10 2 L10 22 M4 16 L10 22 L16 16"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Beat 6 (quiet): Ray Renders branding — bottom right */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          bottom: "1.5rem",
          right: "1.5rem",
          opacity: brandVisible ? 0.18 : 0,
          transition: reduced ? "none" : "opacity 1.5s ease",
          fontSize: "0.625rem",
          fontWeight: 300,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        Ray Renders
      </div>

      <style>{`
        @keyframes hero-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
      `}</style>
    </div>
  );
}
