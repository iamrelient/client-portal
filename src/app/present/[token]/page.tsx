"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PresentationShell,
  type PresentationData,
} from "@/components/presentation/presentation-shell";
import { RayRendersIcon } from "@/components/ui/ray-renders-icon";
import { SpaceBackground } from "@/components/presentation/space-background";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; data: PresentationData }
  | { status: "password_required"; title: string | null; clientLogo: string | null }
  | { status: "error"; error: string; code: string };

interface LoadingSplashProps {
  /** Whether the splash should be visible at all. */
  visible: boolean;
  /** Once data has loaded AND the minimum splash duration has
   *  elapsed, we flip this true and start prompting the user for a
   *  click. Until then the splash sits in its logo-fill animation. */
  readyForGesture: boolean;
  /** Click handler — fires requestFullscreen() + dismisses. Must be
   *  invoked from a real user gesture so the fullscreen API accepts.
   *  We listen on the whole splash so a tap anywhere works. */
  onGesture: () => void;
}

function LoadingSplash({
  visible,
  readyForGesture,
  onGesture,
}: LoadingSplashProps) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Once we're ready for a gesture, listen for keyboard too — a lot
  // of presentations get opened on a laptop where the viewer's hand
  // is already on the keyboard. Any key counts as the gesture.
  useEffect(() => {
    if (!visible || !readyForGesture) return;
    function handleKey(e: KeyboardEvent) {
      // Don't catch modifier-only presses or system shortcuts.
      if (e.key === "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
      onGesture();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, readyForGesture, onGesture]);

  return (
    <div
      onClick={readyForGesture ? onGesture : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#060608",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2.5rem",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s cubic-bezier(0.25,0.1,0.25,1)",
        pointerEvents: visible ? "auto" : "none",
        // Cursor only changes once we're actually expecting a click,
        // so the splash doesn't tease before data is ready.
        cursor: readyForGesture ? "pointer" : "default",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Animated space background — branded loader instead of a flat
          dark screen. Rich variant for the fuller planet treatment;
          no scrollContainer so it's twinkle + drift only (the splash
          doesn't scroll). Sits behind the logo + prompt. */}
      <SpaceBackground variant="rich" seed={108} inline />

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

      {/* "Tap to begin" prompt — appears once data loaded + min
          splash time elapsed. Browsers require a user gesture
          before granting fullscreen, so we make that gesture the
          first interaction. The wording is intentionally generic
          (works on phone / tablet / desktop) and the prompt fades
          in gently so it doesn't shout once the logo settles. */}
      <div
        style={{
          opacity: readyForGesture ? 1 : 0,
          transform: readyForGesture ? "translateY(0)" : "translateY(8px)",
          transition:
            "opacity 600ms cubic-bezier(0.25,0.1,0.25,1) 150ms, " +
            "transform 600ms cubic-bezier(0.25,0.1,0.25,1) 150ms",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6rem",
        }}
      >
        <div
          className="splash-pulse-dot"
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.9)",
          }}
        />
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 300,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.8)",
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
          }}
        >
          Tap to begin
        </span>
        <span
          style={{
            fontSize: "0.625rem",
            fontWeight: 300,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
          }}
        >
          Opens in fullscreen
        </span>
      </div>

      <style>{`
        .splash-pulse-dot {
          animation: splash-pulse 1.6s ease-in-out infinite;
        }
        @keyframes splash-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .splash-pulse-dot { animation: none; opacity: 0.9; }
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
  const [readyForGesture, setReadyForGesture] = useState(false);
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

  // Once data is loaded + minimum splash duration elapsed, prompt
  // the viewer for the gesture that authorizes fullscreen. We hold
  // the splash open instead of auto-dismissing — browsers require a
  // real user input to grant requestFullscreen, so the splash is
  // the natural place to collect it.
  useEffect(() => {
    if (state.status !== "loaded") return;
    const elapsed = Date.now() - (loadedAtRef.current || Date.now());
    const remaining = Math.max(0, 1800 - elapsed);
    const timer = setTimeout(() => setReadyForGesture(true), remaining);
    return () => clearTimeout(timer);
  }, [state.status]);

  /** Begin handler — fires from the splash's click or first
   *  keypress. Attempts fullscreen + dismisses the splash. We don't
   *  block the dismiss on the fullscreen result: if the browser
   *  rejects (Safari on iOS often does, restrictive PWA contexts,
   *  fullscreen disabled in policy) the presentation still opens
   *  windowed — the existing fullscreen toggle in the corner is
   *  always available as a manual fallback. */
  const handleBegin = useCallback(async () => {
    try {
      // requestFullscreen returns a promise in modern browsers; we
      // await it so any error throws into our catch rather than
      // leaving an unhandled rejection in the console.
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Silent — the fallback (windowed) is fine. We don't want to
      // bug the viewer with a toast for a permission they probably
      // can't change.
    }
    setSplashVisible(false);
  }, []);

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
      {/* Splash screen — collects the user gesture that authorizes
          fullscreen. Stays visible until clicked, even after the
          deck is fully loaded behind it. */}
      <LoadingSplash
        visible={splashVisible}
        readyForGesture={readyForGesture}
        onGesture={handleBegin}
      />

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
