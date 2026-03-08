"use client";

import { useEffect, useRef } from "react";
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
        "interaction-prompt"?: string;
        loading?: string;
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const DEFAULT_MODEL = "/models/3dExport.gltf";

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */
interface DashboardHero3DProps {
  gltfUrl?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Loading fallback                                                    */
/* ------------------------------------------------------------------ */
function CardLoadingFallback() {
  return (
    <div className="flex aspect-[4/3] w-96 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner component (only loaded client-side via dynamic import)        */
/* ------------------------------------------------------------------ */
function DashboardHero3DInner({ gltfUrl, className }: DashboardHero3DProps) {
  const viewerRef = useRef<HTMLElement>(null);

  /* Register the <model-viewer> custom element */
  useEffect(() => {
    import("@google/model-viewer");
  }, []);

  return (
    <div className={className}>
      {/* Hide model-viewer's default UI chrome */}
      <style>{`
        model-viewer::part(default-ar-button) { display: none !important; }
        model-viewer::part(default-progress-bar) { display: none !important; }
      `}</style>
      <model-viewer
        ref={viewerRef}
        src={gltfUrl || DEFAULT_MODEL}
        alt="3D Building Model"
        auto-rotate=""
        rotation-per-second="15deg"
        bounds="tight"
        camera-orbit="0deg 60deg auto"
        min-camera-orbit="auto auto 5%"
        environment-image="neutral"
        exposure="1"
        interaction-prompt="none"
        style={
          {
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            "--poster-color": "transparent",
          } as React.CSSProperties
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export — SSR-safe dynamic import                                    */
/* ------------------------------------------------------------------ */
export const DashboardHero3D = dynamic(
  () => Promise.resolve(DashboardHero3DInner),
  {
    ssr: false,
    loading: () => <CardLoadingFallback />,
  }
);
