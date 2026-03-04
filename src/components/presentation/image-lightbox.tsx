"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PresentationData, SectionData } from "./presentation-shell";

interface ImageLightboxProps {
  sections: SectionData[];
  activeImageId: string;
  data: PresentationData;
  onClose: () => void;
}

export function ImageLightbox({
  sections,
  activeImageId,
  data,
  onClose,
}: ImageLightboxProps) {
  const images = sections.filter((s) => s.type === "image" && s.file);
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.max(0, images.findIndex((s) => s.id === activeImageId))
  );
  const backdropRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(false);

  // SSR guard + fade in on mount
  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setEntered(true));
  }, []);

  const currentImage = images[currentIndex];
  const assetUrl = currentImage?.file
    ? `/api/present/${data.accessToken}/asset/${currentImage.file.id}`
    : null;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose, goNext, goPrev]);

  // Click backdrop to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  // Prevent scroll-jacking while lightbox is open
  useEffect(() => {
    const scrollContainer = document.querySelector(
      ".scrollbar-hide"
    ) as HTMLElement;
    if (scrollContainer) {
      const prev = scrollContainer.style.overflow;
      scrollContainer.style.overflow = "hidden";
      return () => {
        scrollContainer.style.overflow = prev;
      };
    }
  }, []);

  const modal = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,6,8,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        opacity: entered ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.08)",
          border: "none",
          borderRadius: "50%",
          cursor: "pointer",
          zIndex: 2,
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
        }
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <line
            x1="2" y1="2" x2="12" y2="12"
            stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"
          />
          <line
            x1="12" y1="2" x2="2" y2="12"
            stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"
          />
        </svg>
      </button>

      {/* Previous arrow */}
      {images.length > 1 && (
        <button
          onClick={goPrev}
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
          }
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8L10 13"
              stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"
            />
          </svg>
        </button>
      )}

      {/* Next arrow */}
      {images.length > 1 && (
        <button
          onClick={goNext}
          style={{
            position: "absolute",
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
          }
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6 3L11 8L6 13"
              stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"
            />
          </svg>
        </button>
      )}

      {/* Image — object-fit: contain, no cropping */}
      {assetUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentImage.id}
          src={assetUrl}
          alt={currentImage.title || ""}
          draggable={false}
          style={{
            maxWidth: "calc(100vw - 120px)",
            maxHeight: "calc(100vh - 80px)",
            objectFit: "contain",
            borderRadius: "2px",
            pointerEvents: "none",
            WebkitUserDrag: "none",
            animation: "lightbox-enter 0.25s ease",
          } as React.CSSProperties}
        />
      )}

      {/* Caption */}
      {currentImage?.title && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            maxWidth: "60vw",
          }}
        >
          <p
            style={{
              fontSize: "0.875rem",
              fontWeight: 300,
              letterSpacing: "0.04em",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            {currentImage.title}
          </p>
        </div>
      )}

      {/* Counter */}
      {images.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "0.7rem",
            fontWeight: 300,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.3)",
          }}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

      <style>{`
        @keyframes lightbox-enter {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
