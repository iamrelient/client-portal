"use client";

import { useEffect, useState, useRef } from "react";

interface SectionDividerProps {
  section: {
    title: string | null;
    metadata: Record<string, unknown> | null;
  };
  onComplete: () => void;
}

/**
 * Transient Chapter Title Overlay
 *
 * When the shell navigates to a divider section, this renders a full-screen
 * off-white overlay with the chapter title animating in (slide-up + fade-in),
 * holds for 1.5s, then fades out to reveal the next section beneath.
 * After the fade-out completes, onComplete() fires so the shell auto-advances.
 */
export function SectionDivider({ section, onComplete }: SectionDividerProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");
  const completeCalled = useRef(false);

  useEffect(() => {
    // Phase timeline:
    // 0ms:      mount (phase=enter, title invisible)
    // 50ms:     phase=visible → title animates in via animate-slide-up-fade (600ms)
    // 1650ms:   phase=exit → overlay fades out (500ms)
    // 2150ms:   onComplete() → shell auto-advances to next section

    const visibleTimer = setTimeout(() => setPhase("visible"), 50);

    const exitTimer = setTimeout(() => setPhase("exit"), 1650);

    const completeTimer = setTimeout(() => {
      if (!completeCalled.current) {
        completeCalled.current = true;
        onComplete();
      }
    }, 2150);

    return () => {
      clearTimeout(visibleTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const title = section.title || "";

  return (
    <div
      className={`
        absolute inset-0 z-30 flex items-center justify-center bg-neutral-50
        transition-opacity duration-500 ease-in-out
        ${phase === "exit" ? "opacity-0" : "opacity-100"}
      `}
    >
      {title && (
        <h2
          className={`
            text-neutral-900 text-center px-8
            text-2xl md:text-4xl lg:text-5xl
            font-light tracking-[0.12em] uppercase leading-tight
            ${phase === "visible" || phase === "exit" ? "animate-slide-up-fade" : "opacity-0"}
          `}
        >
          {title}
        </h2>
      )}
    </div>
  );
}
