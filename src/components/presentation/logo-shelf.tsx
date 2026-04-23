"use client";

export type LogoMode = "auto" | "white" | "light-bg" | "transparent";
export type LogoSize = "small" | "medium" | "large";

interface LogoShelfProps {
  src: string;
  mode?: LogoMode;
  /** Per-surface height at the "medium" size. Small = 0.75x, large = 1.5x. */
  baseHeight: string;
  size?: LogoSize;
}

/** Multiply a clamp()-based height by a scalar. Falls back to raw
 *  concatenation for non-clamp values (the caller can pass a plain
 *  pixel string too). */
function scaleHeight(baseHeight: string, size: LogoSize): string {
  const scale = size === "small" ? 0.75 : size === "large" ? 1.5 : 1;
  if (scale === 1) return baseHeight;
  const match = baseHeight.match(
    /^clamp\(\s*([0-9.]+)px\s*,\s*([0-9.]+)vw\s*,\s*([0-9.]+)px\s*\)$/
  );
  if (match) {
    const [, min, vw, max] = match;
    return `clamp(${+min * scale}px, ${+vw * scale}vw, ${+max * scale}px)`;
  }
  const px = baseHeight.match(/^([0-9.]+)px$/);
  if (px) return `${+px[1] * scale}px`;
  return baseHeight; // unknown format — leave alone
}

export function LogoShelf({
  src,
  mode = "auto",
  baseHeight,
  size = "medium",
}: LogoShelfProps) {
  const height = scaleHeight(baseHeight, size);
  const imgStyle: React.CSSProperties = {
    height,
    width: "auto",
    pointerEvents: "none",
    display: "block",
  };

  if (mode === "transparent") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" draggable={false} style={imgStyle} />
    );
  }

  if (mode === "white") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          ...imgStyle,
          filter: "brightness(0) invert(1)",
        }}
      />
    );
  }

  if (mode === "light-bg") {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.95)",
          padding: "1.5rem 2.5rem",
          borderRadius: "4px",
          boxShadow: "0 2px 20px rgba(0,0,0,0.3)",
          display: "inline-block",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} style={imgStyle} />
      </div>
    );
  }

  // "auto" — frosted backdrop, original colors preserved
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "1.5rem 2.5rem",
        borderRadius: "4px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "inline-block",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          ...imgStyle,
          filter: "drop-shadow(0 0 1px rgba(255,255,255,0.15))",
        }}
      />
    </div>
  );
}
