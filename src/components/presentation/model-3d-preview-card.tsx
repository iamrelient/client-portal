"use client";

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { PreviewHotspot } from "@/types/model3d";

/* ------------------------------------------------------------------ */
/*  Model3DPreviewCard — overlay with thumbnail previews + navigate    */
/* ------------------------------------------------------------------ */

interface Model3DPreviewCardProps {
  hotspot: PreviewHotspot;
  accessToken: string;
  onClose: () => void;
  onNavigate: (targetChapter: string) => void;
}

export function Model3DPreviewCard({
  hotspot,
  accessToken,
  onClose,
  onNavigate,
}: Model3DPreviewCardProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  /* ---- Escape key ---- */
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

  /* ---- Click outside ---- */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  /* ---- Navigate + close ---- */
  const handleGoToChapter = useCallback(() => {
    onNavigate(hotspot.targetChapter);
    onClose();
  }, [hotspot.targetChapter, onNavigate, onClose]);

  const fileIds = hotspot.previewFileIds || [];
  const imageCount = fileIds.length;

  // Grid layout: 1 image = full width, 2 = side by side, 3 = top + 2 bottom
  const gridStyle: React.CSSProperties =
    imageCount <= 1
      ? {}
      : imageCount === 2
        ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }
        : {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          };

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
        background: "rgba(6,6,8,0.85)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        animation: "m3d-card-fadein 0.25s ease",
        padding: "1rem",
      }}
    >
      {/* Card */}
      <div
        className="m3d-card"
        style={{
          position: "relative",
          width: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          overflowY: "auto",
          background: "rgba(20,20,24,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          animation: "m3d-card-slidein 0.3s ease",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Close button — 44px minimum touch target */}
        <button
          onClick={onClose}
          data-cursor-label="Close"
          data-clickable
          className="m3d-card-close"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
          }
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
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

        {/* Thumbnails */}
        {imageCount > 0 && (
          <div className="m3d-card-grid" style={{ padding: 16, paddingBottom: 0, ...gridStyle }}>
            {fileIds.map((fileId, idx) => (
              <div
                key={fileId}
                style={{
                  position: "relative",
                  borderRadius: 8,
                  overflow: "hidden",
                  // First image spans full width when 3 images
                  ...(imageCount === 3 && idx === 0
                    ? { gridColumn: "1 / -1" }
                    : {}),
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/present/${accessToken}/asset/${fileId}`}
                  alt={`${hotspot.label} preview ${idx + 1}`}
                  className={`m3d-card-img ${imageCount === 1 ? "m3d-card-img-single" : idx === 0 && imageCount === 3 ? "m3d-card-img-hero" : "m3d-card-img-thumb"}`}
                  style={{
                    width: "100%",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: 8,
                    animation: `m3d-card-imgfade 0.4s ease ${0.15 + idx * 0.1}s both`,
                  }}
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}

        {/* Label + navigate button */}
        <div className="m3d-card-footer">
          <h3
            style={{
              fontSize: "0.8125rem",
              fontWeight: 300,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.7)",
              margin: 0,
            }}
          >
            {hotspot.label}
          </h3>

          <button
            onClick={handleGoToChapter}
            data-cursor-label="Go"
            data-clickable
            className="m3d-card-nav-btn"
          >
            Go to chapter
          </button>
        </div>
      </div>

      <style>{`
        @keyframes m3d-card-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes m3d-card-slidein {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes m3d-card-imgfade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .m3d-card {
          max-width: ${imageCount === 1 ? "520px" : "600px"};
        }
        .m3d-card-close {
          width: 36px;
          height: 36px;
        }
        .m3d-card-img-single { height: auto; }
        .m3d-card-img-hero { height: 220px; }
        .m3d-card-img-thumb { height: 160px; }

        .m3d-card-footer {
          padding: 16px 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .m3d-card-nav-btn {
          padding: 8px 20px;
          font-size: 0.6875rem;
          font-weight: 300;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .m3d-card-nav-btn:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
        }

        /* Mobile adjustments */
        @media (max-width: 480px) {
          .m3d-card {
            max-width: 100%;
            border-radius: 10px;
          }
          .m3d-card-grid {
            padding: 12px 12px 0 !important;
            gap: 6px !important;
          }
          .m3d-card-img-hero { height: 160px; }
          .m3d-card-img-thumb { height: 120px; }
          .m3d-card-footer {
            padding: 12px 12px 16px;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .m3d-card-nav-btn {
            text-align: center;
            padding: 10px 16px;
          }
        }

        /* Touch targets */
        @media (pointer: coarse) {
          .m3d-card-close {
            width: 44px;
            height: 44px;
          }
          .m3d-card-nav-btn {
            min-height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
