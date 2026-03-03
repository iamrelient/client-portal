"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

  useEffect(() => {
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
    const lerp = 0.12;
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
        "button, a, [role='button'], video, [data-cursor-label]"
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

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [enabled]);

  if (!enabled) return null;

  // Determine cursor size and style
  let size = 24;
  let bg = "rgba(255,255,255,0.15)";
  let border = "none";

  if (overClickable) {
    size = 48;
    bg = "rgba(255,255,255,0.08)";
  } else if (overImage) {
    size = 32;
    bg = "transparent";
    border = "1px solid rgba(255,255,255,0.2)";
  }

  return (
    <>
      <style>{`
        .presentation-shell, .presentation-shell * {
          cursor: none !important;
        }
      `}</style>
      <div
        ref={cursorRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: bg,
          border,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: scrolling ? 0 : 1,
          transition: "width 0.25s ease, height 0.25s ease, background-color 0.25s ease, border 0.25s ease, opacity 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          willChange: "transform",
        }}
      >
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
            }}
          >
            {label}
          </span>
        )}
      </div>
    </>
  );
}
