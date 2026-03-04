"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export function PresentationCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: -100, y: -100 });
  const targetRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number>(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [label, setLabel] = useState<string | null>(null);
  const [overClickable, setOverClickable] = useState(false);
  const [overImage, setOverImage] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Desktop only, respect reduced motion
    const isTouch =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (isTouch || reduced) {
      setEnabled(false);
      return;
    }

    setEnabled(true);
  }, []);

  // Animation loop — smooth lag
  const animate = useCallback(() => {
    const lerp = 0.25;
    posRef.current.x += (targetRef.current.x - posRef.current.x) * lerp;
    posRef.current.y += (targetRef.current.y - posRef.current.y) * lerp;

    const el = cursorRef.current;
    if (el) {
      el.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px) translate(-50%, -50%)`;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, animate]);

  // Track mouse position
  useEffect(() => {
    if (!enabled) return;

    const handleMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY };

      // Detect what we're hovering
      const target = e.target as HTMLElement;

      // Check for clickable elements
      const clickable = target.closest(
        "button, a, [role='button'], video, [data-cursor-label], [data-clickable]"
      );

      if (clickable) {
        setOverClickable(true);
        const cursorLabel =
          clickable.getAttribute("data-cursor-label") || null;
        setLabel(cursorLabel);
      } else {
        setOverClickable(false);
        setLabel(null);
      }

      // Check for images
      const isImage =
        target.tagName === "IMG" ||
        !!target.closest("[data-cursor-ring]");
      setOverImage(isImage && !clickable);
    };

    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [enabled]);

  // Detect scrolling — fade out cursor
  useEffect(() => {
    if (!enabled) return;

    const handleScroll = () => {
      setScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setScrolling(false), 150);
    };

    window.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [enabled]);

  if (!enabled || !mounted) return null;

  // Determine cursor size and style — white glass with edge refraction
  let size = 16;
  let border = "1px solid rgba(255,255,255,0.2)";

  if (overClickable) {
    size = 32;
    border = "1px solid rgba(255,255,255,0.35)";
  } else if (overImage) {
    size = 22;
    border = "1px solid rgba(255,255,255,0.3)";
  }

  // Radial mask: transparent center → opaque edge = refraction ring
  const maskGradient =
    "radial-gradient(circle at center, transparent 40%, black 75%)";

  return createPortal(
    <>
      <style>{`
        .presentation-shell, .presentation-shell *,
        body *, body {
          cursor: none !important;
        }
      `}</style>
      {/* Outer wrapper — border ring + label container */}
      <div
        ref={cursorRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          border,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: scrolling ? 0 : 1,
          transition:
            "width 0.25s ease, height 0.25s ease, border 0.25s ease, opacity 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          willChange: "transform",
        }}
      >
        {/* Inner refraction layer — edge blur via masked backdrop-filter */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            WebkitMaskImage: maskGradient,
            maskImage: maskGradient,
          }}
        />
        {label && overClickable && (
          <span
            style={{
              fontSize: "0.5rem",
              fontWeight: 300,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              whiteSpace: "nowrap",
              userSelect: "none",
              position: "relative",
            }}
          >
            {label}
          </span>
        )}
      </div>
    </>,
    document.body
  );
}
