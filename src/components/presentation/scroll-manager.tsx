"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ScrollState {
  progress: number;
  currentSection: number;
  totalSections: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useScrollManager(totalSections: number): ScrollState {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState(0);

  const rafId = useRef(0);

  const handleScroll = useCallback(() => {
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const el = containerRef.current;
      if (!el) return;

      const scrollTop = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;

      if (maxScroll > 0) {
        setProgress(scrollTop / maxScroll);
      }

      const sectionHeight = el.clientHeight;
      const index = Math.round(scrollTop / sectionHeight);
      setCurrentSection(Math.min(index, totalSections - 1));
    });
  }, [totalSections]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleScroll]);

  return { progress, currentSection, totalSections, containerRef };
}
