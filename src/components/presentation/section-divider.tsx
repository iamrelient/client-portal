"use client";

import { useEffect, useRef, useState } from "react";

interface SectionDividerProps {
  section: {
    metadata: Record<string, unknown> | null;
  };
}

type AmbientStyle = "grid" | "particles" | "line-pulse" | "gradient-shift";

function getAmbientStyle(metadata: Record<string, unknown> | null): AmbientStyle {
  const style = metadata?.ambientStyle as string | undefined;
  if (
    style === "grid" ||
    style === "particles" ||
    style === "line-pulse" ||
    style === "gradient-shift"
  ) {
    return style;
  }
  // Default: pick one based on random
  const options: AmbientStyle[] = ["grid", "particles", "line-pulse", "gradient-shift"];
  return options[Math.floor(Math.random() * options.length)];
}

export function SectionDivider({ section }: SectionDividerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const ambientRef = useRef(getAmbientStyle(section.metadata));

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ambient = ambientRef.current;

  return (
    <div
      ref={ref}
      style={{
        height: "100%",
        width: "100%",
        backgroundColor: "#060608",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {!reduced && visible && (
        <>
          {ambient === "grid" && <AmbientGrid />}
          {ambient === "particles" && <AmbientParticles />}
          {ambient === "line-pulse" && <AmbientLinePulse />}
          {ambient === "gradient-shift" && <AmbientGradientShift />}
        </>
      )}
    </div>
  );
}

function AmbientGrid() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <pattern
            id="divider-grid"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#divider-grid)" />
      </svg>
      <style>{`
        @keyframes divider-grid-draw {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        [id="divider-grid"] + rect {
          animation: divider-grid-draw 3s ease forwards;
        }
      `}</style>
    </div>
  );
}

function AmbientParticles() {
  // Generate static particle positions (deterministic per render)
  const particles = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      x: ((i * 37 + 13) % 100),
      delay: (i * 0.7) % 8,
      size: 1 + (i % 3) * 0.5,
      duration: 10 + (i % 5) * 2,
    }))
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {particles.current.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            bottom: "-5%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.04)",
            animation: `divider-float ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes divider-float {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-110vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function AmbientLinePulse() {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          height: 1,
          backgroundColor: "rgba(255,255,255,0.15)",
          animation: "divider-line-pulse 4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes divider-line-pulse {
          0%, 100% { width: 5%; opacity: 0.08; }
          50% { width: 35%; opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}

function AmbientGradientShift() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        animation: "divider-gradient-shift 10s ease-in-out infinite",
        opacity: 0.04,
      }}
    >
      <style>{`
        @keyframes divider-gradient-shift {
          0%, 100% {
            background: radial-gradient(ellipse at 30% 50%, rgba(120,130,255,1) 0%, transparent 70%);
          }
          33% {
            background: radial-gradient(ellipse at 70% 40%, rgba(130,120,255,1) 0%, transparent 70%);
          }
          66% {
            background: radial-gradient(ellipse at 50% 60%, rgba(110,140,255,1) 0%, transparent 70%);
          }
        }
      `}</style>
    </div>
  );
}
