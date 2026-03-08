"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  TypeScript: declare <model-viewer> as a valid JSX element           */
/* ------------------------------------------------------------------ */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        "auto-rotate"?: string;
        "rotation-per-second"?: string;
        "camera-controls"?: string;
        "camera-orbit"?: string;
        "min-camera-orbit"?: string;
        bounds?: string;
        "environment-image"?: string;
        exposure?: string;
        "shadow-intensity"?: string;
        loading?: string;
        poster?: string;
        reveal?: string;
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const DEFAULT_MODEL = "/models/3dExport.gltf";
const INTRO_DURATION_MS = 2500;
const FAST_SPIN = "180deg";
const SLOW_SPIN = "15deg";

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */
interface DashboardHero3DProps {
  gltfUrl?: string;
  onIntroComplete?: () => void;
  children?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Loading fallback                                                    */
/* ------------------------------------------------------------------ */
function HeroLoadingFallback() {
  return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner component (only loaded client-side via dynamic import)        */
/* ------------------------------------------------------------------ */
function DashboardHero3DInner({
  gltfUrl,
  onIntroComplete,
  children,
}: DashboardHero3DProps) {
  const [introFinished, setIntroFinished] = useState(false);
  const viewerRef = useRef<HTMLElement>(null);
  const callbackRef = useRef(onIntroComplete);
  callbackRef.current = onIntroComplete;

  /* Register the <model-viewer> custom element */
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  /* Intro timer — fires once, then calls parent */
  useEffect(() => {
    const timer = setTimeout(() => {
      setIntroFinished(true);
      callbackRef.current?.();
    }, INTRO_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  /* Imperatively update dynamic attributes (React 18 custom-element compat) */
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    el.setAttribute("rotation-per-second", introFinished ? SLOW_SPIN : FAST_SPIN);
    if (introFinished) {
      el.setAttribute("camera-controls", "");
    }
  }, [introFinished]);

  const modelSrc = gltfUrl || DEFAULT_MODEL;

  return (
    <motion.div
      className="relative mb-6 w-full overflow-hidden rounded-xl border border-white/[0.08]"
      initial={{ height: "100vh" }}
      animate={{ height: introFinished ? 400 : "100vh" }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    >
      {/* Layer 0: 3D model (background) */}
      <model-viewer
        ref={viewerRef}
        src={modelSrc}
        alt="3D Building Model"
        auto-rotate=""
        rotation-per-second={FAST_SPIN}
        bounds="tight"
        camera-orbit="0deg 60deg auto"
        min-camera-orbit="auto auto 5%"
        environment-image="neutral"
        exposure="1"
        style={
          {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            "--poster-color": "transparent",
          } as React.CSSProperties
        }
      />

      {/* Layer 1: gradient overlay for text readability */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-gray-900/80 via-transparent to-gray-900/90" />

      {/* Layer 2: overlay content (title, timeline) */}
      <div className="relative z-[2] flex h-full flex-col justify-between p-6">
        {children}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export — SSR-safe dynamic import                                    */
/* ------------------------------------------------------------------ */
export const DashboardHero3D = dynamic(
  () => Promise.resolve(DashboardHero3DInner),
  {
    ssr: false,
    loading: () => <HeroLoadingFallback />,
  }
);
