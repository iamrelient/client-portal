"use client";

interface LogoShelfProps {
  src: string;
  mode?: "auto" | "white" | "light-bg";
  height: string;
}

export function LogoShelf({ src, mode = "auto", height }: LogoShelfProps) {
  const imgStyle: React.CSSProperties = {
    height,
    width: "auto",
    pointerEvents: "none",
    display: "block",
  };

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
