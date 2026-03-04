"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InfoContent } from "@/types/panorama";

interface PanoramaInfoModalProps {
  content: InfoContent;
  label: string;
  accessToken: string;
  onClose: () => void;
}

function getVideoEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;

  return null;
}

export function PanoramaInfoModal({
  content,
  label,
  accessToken,
  onClose,
}: PanoramaInfoModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  // Swipe down to close on mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (dy > 80) onClose();
      startY.current = null;
    },
    [onClose]
  );

  const assetUrl = (fileId: string) =>
    `/api/present/${accessToken}/asset/${fileId}`;

  const modal = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,6,8,0.8)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "pano-modal-fadein 0.25s ease",
      }}
    >
      {/* Content card */}
      <div
        style={{
          position: "relative",
          maxWidth: 800,
          width: "calc(100% - 2rem)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "rgba(20,20,24,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          animation: "pano-modal-slidein 0.3s ease",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <line
              x1="2"
              y1="2"
              x2="12"
              y2="12"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
            />
            <line
              x1="12"
              y1="2"
              x2="2"
              y2="12"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
            />
          </svg>
        </button>

        {/* Swipe indicator for mobile */}
        <div
          style={{
            width: 32,
            height: 3,
            borderRadius: 2,
            background: "rgba(255,255,255,0.2)",
            margin: "8px auto 0",
          }}
        />

        {/* Content */}
        <div style={{ padding: "1.5rem" }}>
          {/* Label */}
          <div
            style={{
              fontSize: "0.625rem",
              fontWeight: 300,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.4)",
              marginBottom: "0.75rem",
            }}
          >
            {label}
          </div>

          {/* Text content */}
          {content.type === "text" && (
            <div>
              <h3
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.9)",
                  marginBottom: "0.75rem",
                  lineHeight: 1.3,
                }}
              >
                {content.title}
              </h3>
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {content.body}
              </p>
            </div>
          )}

          {/* Image content */}
          {content.type === "image" && (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(content.fileId)}
                alt={content.caption || label}
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: 8,
                  display: "block",
                }}
              />
              {content.caption && (
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 300,
                    color: "rgba(255,255,255,0.5)",
                    marginTop: "0.75rem",
                    textAlign: "center",
                  }}
                >
                  {content.caption}
                </p>
              )}
            </div>
          )}

          {/* Video content */}
          {content.type === "video" && (
            <div>
              {(() => {
                const embedUrl = getVideoEmbedUrl(content.url);
                if (embedUrl) {
                  return (
                    <div
                      style={{
                        position: "relative",
                        paddingBottom: "56.25%",
                        height: 0,
                        overflow: "hidden",
                        borderRadius: 8,
                      }}
                    >
                      <iframe
                        src={embedUrl}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          border: "none",
                        }}
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  );
                }
                return (
                  <video
                    src={content.url}
                    controls
                    autoPlay
                    style={{
                      width: "100%",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                );
              })()}
            </div>
          )}

          {/* PDF content */}
          {content.type === "pdf" && (
            <div>
              {content.title && (
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 300,
                    color: "rgba(255,255,255,0.9)",
                    marginBottom: "0.75rem",
                  }}
                >
                  {content.title}
                </h3>
              )}
              <iframe
                src={assetUrl(content.fileId)}
                style={{
                  width: "100%",
                  height: "70vh",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  background: "white",
                }}
              />
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pano-modal-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pano-modal-slidein {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
