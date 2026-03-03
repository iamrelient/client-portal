"use client";

interface WatermarkOverlayProps {
  enabled: boolean;
  viewerName?: string;
}

export function WatermarkOverlay({ enabled, viewerName }: WatermarkOverlayProps) {
  if (!enabled) return null;

  const text = viewerName || "CONFIDENTIAL";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      <style>{`
        .presentation-watermark::after {
          content: "${text.replace(/"/g, '\\"')}";
          position: fixed;
          bottom: 20px;
          right: 20px;
          color: rgba(255, 255, 255, 0.15);
          font-size: 10px;
          font-weight: 300;
          font-family: 'Inter', sans-serif;
          letter-spacing: 0.03em;
          pointer-events: none;
          z-index: 40;
          user-select: none;
          -webkit-user-select: none;
        }
      `}</style>
      <div className="presentation-watermark" />
    </div>
  );
}
