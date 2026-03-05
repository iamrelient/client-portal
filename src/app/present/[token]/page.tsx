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
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 100);
    return () => clearTimeout(timer);
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
      {/* Logo with fill effect */}
      <div
        style={{
          position: "relative",
          width: "clamp(48px, 8vw, 72px)",
          height: "clamp(48px, 8vw, 72px)",
        }}
      >
        {/* Ghost layer — dim outline */}
        <RayRendersIcon
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            color: "#fff",
            opacity: started ? 0.12 : 0,
            transition: "opacity 0.4s ease",
          }}
        />
        {/* Fill layer — clips left to right */}
        <RayRendersIcon
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            color: "#fff",
            opacity: 0.9,
            clipPath: started
              ? "inset(0 0% 0 0)"
              : "inset(0 100% 0 0)",
            transition: "clip-path 2s cubic-bezier(0.25,0.1,0.25,1)",
          }}
        />
      </div>

      <style>{``}</style>
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
