"use client";

import { useEffect, useRef, useState } from "react";
import type { PresentationData } from "./presentation-shell";
import { LogoShelf } from "./logo-shelf";

interface SectionClosingProps {
  data: PresentationData;
}

export function SectionClosing({ data }: SectionClosingProps) {
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
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const title = data.title || data.project.name;
  const company = data.project.company;
  const hasLogo = !!data.clientLogo;

  const fade = (delay: number): React.CSSProperties =>
    reduced
      ? { opacity: 1 }
      : {
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: `opacity 1s cubic-bezier(0.25,0.1,0.25,1) ${delay}ms, transform 1s cubic-bezier(0.25,0.1,0.25,1) ${delay}ms`,
        };

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#060608",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "0 clamp(1rem, 4vw, 2rem)",
          maxWidth: 600,
        }}
      >
        {/* Client logo */}
        {hasLogo && (
          <div style={{ marginBottom: "2rem", ...fade(0) }}>
            <LogoShelf
              src={`/api/present/${data.accessToken}/asset/${data.clientLogo}`}
              mode={(data.logoDisplay as "auto" | "white" | "light-bg" | "transparent") || "auto"}
              baseHeight="clamp(48px, 7vw, 96px)"
              size={(data.logoSize as "small" | "medium" | "large") || "medium"}
            />
          </div>
        )}

        {/* Project name */}
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3.5vw, 2.75rem)",
            fontWeight: 300,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.9)",
            lineHeight: 1.2,
            ...fade(200),
          }}
        >
          {title}
        </h2>

        {/* Company name */}
        {company && (
          <p
            style={{
              fontSize: "clamp(0.8125rem, 1.2vw, 1rem)",
              fontWeight: 300,
              letterSpacing: "0.05em",
              color: "#b0b0b0",
              marginTop: "0.75rem",
              ...fade(400),
            }}
          >
            {company}
          </p>
        )}

        {/* Horizontal line */}
        <div
          style={{
            width: "30%",
            minWidth: 80,
            height: 1,
            margin: "2.5rem auto",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              height: "100%",
              backgroundColor: "rgba(255,255,255,0.15)",
              left: visible ? "0%" : "50%",
              right: visible ? "0%" : "50%",
              transition: reduced
                ? "none"
                : "left 0.8s cubic-bezier(0.16,1,0.3,1) 600ms, right 0.8s cubic-bezier(0.16,1,0.3,1) 600ms",
            }}
          />
        </div>

        {/* Presented by */}
        <p
          style={{
            fontSize: "0.6875rem",
            fontWeight: 300,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#666",
            marginBottom: "0.5rem",
            ...fade(800),
          }}
        >
          Presented by
        </p>

        {/* Ray Renders logo / name */}
        <p
          style={{
            fontSize: "clamp(0.875rem, 1.5vw, 1.125rem)",
            fontWeight: 300,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.9)",
            ...fade(900),
          }}
        >
          Ray Renders
        </p>

        {/* Favicon */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon.png"
          alt=""
          draggable={false}
          style={{
            width: "clamp(24px, 3vw, 36px)",
            height: "clamp(24px, 3vw, 36px)",
            marginTop: "1.25rem",
            opacity: 0.5,
            ...fade(1000),
          }}
        />

        {/* Contact info */}
        <div
          style={{
            marginTop: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            ...fade(1100),
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 300,
              color: "#666",
              letterSpacing: "0.02em",
            }}
          >
            caleb@rayrenders.com
          </p>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 300,
              color: "#666",
              letterSpacing: "0.02em",
            }}
          >
            rayrenders.com
          </p>
        </div>
      </div>

      {/* Copyright footer */}
      <p
        style={{
          position: "absolute",
          bottom: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "clamp(0.625rem, 1.5vw, 0.6875rem)",
          fontWeight: 300,
          color: "#444",
          letterSpacing: "0.02em",
          whiteSpace: "normal",
          textAlign: "center",
          ...fade(1300),
        }}
      >
        &copy; 2026 Ray Renders LLC &middot; All materials confidential
      </p>
    </div>
  );
}
