"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PresentationShell,
  type PresentationData,
} from "@/components/presentation/presentation-shell";
import { RayRendersIcon } from "@/components/ui/ray-renders-icon";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: PresentationData }
  | { status: "password_required"; title: string | null; clientLogo: string | null }
  | { status: "error"; error: string; code: string };

function LoadingSplash({ visible }: { visible: boolean }) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setBeat(1), 100),   // Icon fades in
      setTimeout(() => setBeat(2), 600),   // Line extends
      setTimeout(() => setBeat(3), 1000),  // Text appears
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#060608",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s cubic-bezier(0.25,0.1,0.25,1)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Icon */}
      <RayRendersIcon
        style={{
          width: "clamp(48px, 8vw, 72px)",
          height: "clamp(48px, 8vw, 72px)",
          color: "#fff",
          opacity: beat >= 1 ? 0.9 : 0,
          transform: beat >= 1 ? "scale(1)" : "scale(0.92)",
          transition:
            "opacity 0.8s cubic-bezier(0.25,0.1,0.25,1), transform 0.8s cubic-bezier(0.25,0.1,0.25,1)",
        }}
      />

      {/* Extending line */}
      <div
        style={{
          width: "clamp(60px, 10vw, 100px)",
          height: 1,
          marginTop: "1.5rem",
          marginBottom: "1.5rem",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.25)",
            left: beat >= 2 ? "0%" : "50%",
            right: beat >= 2 ? "0%" : "50%",
            transition:
              "left 0.6s cubic-bezier(0.16,1,0.3,1), right 0.6s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      </div>

      {/* Loading indicator */}
      <div
        style={{
          opacity: beat >= 3 ? 0.4 : 0,
          transition: "opacity 0.6s ease",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: "#fff",
            animation: "splash-pulse 1.4s ease-in-out infinite",
          }}
        />
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: "#fff",
            animation: "splash-pulse 1.4s ease-in-out 0.2s infinite",
          }}
        />
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: "#fff",
            animation: "splash-pulse 1.4s ease-in-out 0.4s infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes splash-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

export default function PresentPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [splashVisible, setSplashVisible] = useState(true);
  const loadedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!params.token) return;

    fetch(`/api/present/${params.token}`)
      .then(async (res) => {
        const data = await res.json();

        if (res.ok) {
          loadedAtRef.current = Date.now();
          setState({ status: "loaded", data });
          return;
        }

        if (data.error === "password_required") {
          setState({
            status: "password_required",
            title: data.title,
            clientLogo: data.clientLogo,
          });
          return;
        }

        setState({
          status: "error",
          error: data.message || "Something went wrong",
          code: data.error || "unknown",
        });
      })
      .catch(() => {
        setState({
          status: "error",
          error: "Failed to load presentation",
          code: "network",
        });
      });
  }, [params.token]);

  // Dismiss splash once data is loaded (min 1.8s total splash time)
  useEffect(() => {
    if (state.status !== "loaded") return;

    const elapsed = Date.now() - (loadedAtRef.current || Date.now());
    const remaining = Math.max(0, 1800 - elapsed);

    const timer = setTimeout(() => setSplashVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [state.status]);

  if (state.status === "password_required") {
    router.replace(`/present/${params.token}/password`);
    return <div className="fixed inset-0 bg-neutral-50" />;
  }

  if (state.status === "error") {
    return (
      <div
        className="fixed inset-0 bg-neutral-50 flex items-center justify-center flex-col p-8 text-center"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <p className="text-lg font-light tracking-wide max-w-md leading-relaxed text-neutral-700">
          {state.code === "expired" || state.code === "revoked"
            ? "This presentation is no longer available. Contact Ray Renders for access."
            : state.error}
        </p>
        <p className="text-xs text-neutral-400 mt-8">Ray Renders</p>
      </div>
    );
  }

  return (
    <>
      {/* Splash screen */}
      <LoadingSplash visible={splashVisible} />

      {/* Presentation — render underneath splash once data is ready */}
      {state.status === "loaded" && (
        <PresentationShell data={state.data} />
      )}

      {/* Still loading — dark bg behind splash */}
      {state.status === "loading" && (
        <div className="fixed inset-0 bg-[#060608]" />
      )}
    </>
  );
}
