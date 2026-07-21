"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PresentationData, SectionData } from "./presentation-shell";

interface SectionVideoProps {
  section: SectionData;
  data: PresentationData;
}

export function SectionVideo({ section, data }: SectionVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  /** Whether the viewer has started playback. Until then we show a big
   *  poster + play button so it's obvious this is a video to click,
   *  instead of a silent full-bleed autoplay that reads as a still. */
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  // Intersection Observer — fade in when in view, and pause (don't
  // stop) if the viewer scrolls away mid-playback. No autoplay: the
  // client presses the play button to start.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.7) {
          setVisible(true);
        } else if (entry.intersectionRatio < 0.3) {
          const video = videoRef.current;
          if (video && !video.paused) {
            video.pause();
            setPlaying(false);
          }
        }
      },
      { threshold: [0.3, 0.7] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Show the first frame as a poster: once metadata loads, nudge the
  // playhead a hair so the browser paints frame 1 instead of black
  // (needs the Range support the asset route now provides). Guarded so
  // it only runs before the viewer has started playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => {
      if (!started && video.currentTime === 0) {
        try {
          video.currentTime = 0.1;
        } catch {
          /* seek not ready yet — harmless */
        }
      }
    };
    video.addEventListener("loadedmetadata", onMeta);
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [started]);

  /** Start playback from the poster state — with sound, since it's an
   *  explicit user gesture. */
  const handleStart = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    const onStarted = () => {
      setStarted(true);
      setPlaying(true);
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    };
    video
      .play()
      .then(onStarted)
      .catch(() => {
        // Autoplay-with-sound can be blocked in rare cases — retry muted
        // so at least the video runs; the client can unmute via controls.
        video.muted = true;
        setMuted(true);
        video.play().then(onStarted).catch(() => {});
      });
  }, []);

  // Track video progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      if (video.duration) {
        setProgress(video.currentTime / video.duration);
      }
    };

    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, []);

  const hideControlsAfterDelay = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Click/tap: toggle audio + show controls
  const handleClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Before playback has started, a click on the stage starts it (the
    // big play button also calls handleStart directly).
    if (!started) {
      handleStart();
      return;
    }

    // A single click toggles play/pause immediately (and reveals the
    // controls) — no "click once to show controls, click again to
    // pause" two-step, which made pausing feel unresponsive.
    if (video.paused) {
      video.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setPlaying(false);
    }
    setShowControls(true);
    hideControlsAfterDelay();
  }, [started, handleStart, hideControlsAfterDelay]);

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    hideControlsAfterDelay();
  }, [hideControlsAfterDelay]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const htmlEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      const exitFn = document.exitFullscreen || (document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen;
      exitFn?.call(document)?.catch?.(() => {});
    } else {
      const reqFn = htmlEl.requestFullscreen || htmlEl.webkitRequestFullscreen;
      reqFn?.call(htmlEl)?.catch?.(() => {});
    }
    hideControlsAfterDelay();
  }, [hideControlsAfterDelay]);

  const progressBarRef = useRef<HTMLDivElement>(null);

  const seekToPosition = useCallback((clientX: number) => {
    const video = videoRef.current;
    const bar = progressBarRef.current;
    if (!video || !video.duration || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    seekToPosition(e.clientX);
    hideControlsAfterDelay();
  }, [hideControlsAfterDelay, seekToPosition]);

  const handleProgressTouch = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    seekToPosition(e.touches[0].clientX);
    hideControlsAfterDelay();
  }, [hideControlsAfterDelay, seekToPosition]);

  const handleProgressTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    seekToPosition(e.touches[0].clientX);
  }, [seekToPosition]);

  const handleMouseMove = useCallback(() => {
    if (showControls) {
      hideControlsAfterDelay();
    }
  }, [showControls, hideControlsAfterDelay]);

  const assetUrl = section.file
    ? `/api/present/${data.accessToken}/asset/${section.file.id}`
    : null;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onTouchStart={() => { if (showControls) hideControlsAfterDelay(); }}
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: "#060608",
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      {assetUrl ? (
        <>
          <video
            ref={videoRef}
            src={assetUrl}
            playsInline
            // Metadata-only until the viewer starts, then let the
            // browser buffer ahead so playback stalls less.
            preload={started ? "auto" : "metadata"}
            onEnded={() => {
              setPlaying(false);
              setShowControls(true);
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              // Contain (not cover) so the whole frame is visible and it
              // reads as a video in a stage, not a cropped background.
              objectFit: "contain",
              opacity: visible ? 1 : 0,
              transition: reduced ? "none" : "opacity 0.8s ease",
            }}
          />

          {/* Poster / play affordance — shown until the viewer starts the
              video. A scrim + large play button + label make it
              unmistakably a video to click. */}
          {!started && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleStart();
              }}
              data-cursor-label="Play video"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1rem",
                zIndex: 2,
                cursor: "pointer",
                background:
                  "linear-gradient(to bottom, rgba(6,6,8,0.25) 0%, rgba(6,6,8,0.5) 100%)",
              }}
            >
              <div
                className="video-play-button"
                style={{
                  position: "relative",
                  width: "clamp(72px, 14vw, 112px)",
                  height: "clamp(72px, 14vw, 112px)",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.14)",
                  backdropFilter: "blur(6px)",
                  border: "2px solid rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="36%" height="36%" viewBox="0 0 32 32" fill="none" style={{ marginLeft: "6%" }}>
                  <path d="M8 6 L26 16 L8 26 Z" fill="rgba(255,255,255,0.95)" />
                </svg>
              </div>
              <span
                style={{
                  fontSize: "clamp(0.7rem, 1.5vw, 0.9rem)",
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.95)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                Play video
              </span>
              <style>{`
                .video-play-button { transition: transform 200ms ease; }
                [data-cursor-label]:hover .video-play-button { transform: scale(1.07); }
              `}</style>
            </div>
          )}

          {/* Transport controls */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 3,
              padding: "2rem 1.5rem 1.5rem",
              background:
                "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
              opacity: showControls ? 1 : 0,
              transform: showControls ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.3s ease, transform 0.3s ease",
              pointerEvents: showControls ? "auto" : "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar — padded touch target */}
            <div
              ref={progressBarRef}
              onClick={handleProgressClick}
              onTouchStart={handleProgressTouch}
              onTouchMove={handleProgressTouchMove}
              style={{
                width: "100%",
                paddingTop: 16,
                paddingBottom: 16,
                marginBottom: "0.25rem",
                cursor: "pointer",
                position: "relative",
                touchAction: "none",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 3,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress * 100}%`,
                    backgroundColor: "rgba(255,255,255,0.6)",
                    transition: "width 0.1s linear",
                  }}
                />
              </div>
            </div>

            {/* Control buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              {/* Play/Pause */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 12,
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                {playing ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="1" width="4" height="14" rx="0.5" fill="rgba(255,255,255,0.8)" />
                    <rect x="10" y="1" width="4" height="14" rx="0.5" fill="rgba(255,255,255,0.8)" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 1 L15 8 L3 15 Z" fill="rgba(255,255,255,0.8)" />
                  </svg>
                )}
              </button>

              {/* Mute/Unmute */}
              <button
                onClick={handleMuteToggle}
                style={{
                  background: "none",
                  border: "none",
                  padding: 12,
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                {muted ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 5.5 L5 5.5 L9 2 L9 14 L5 10.5 L2 10.5 Z" fill="rgba(255,255,255,0.8)" />
                    <line x1="11" y1="5" x2="15" y2="11" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                    <line x1="15" y1="5" x2="11" y2="11" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 5.5 L5 5.5 L9 2 L9 14 L5 10.5 L2 10.5 Z" fill="rgba(255,255,255,0.8)" />
                    <path d="M11 5 Q14 8 11 11" stroke="rgba(255,255,255,0.8)" strokeWidth="1" fill="none" />
                    <path d="M12.5 3 Q16.5 8 12.5 13" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none" />
                  </svg>
                )}
              </button>

              <div style={{ flex: 1 }} />

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                style={{
                  background: "none",
                  border: "none",
                  padding: 12,
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1 5 L1 1 L5 1" stroke="rgba(255,255,255,0.8)" strokeWidth="1" fill="none" />
                  <path d="M11 1 L15 1 L15 5" stroke="rgba(255,255,255,0.8)" strokeWidth="1" fill="none" />
                  <path d="M15 11 L15 15 L11 15" stroke="rgba(255,255,255,0.8)" strokeWidth="1" fill="none" />
                  <path d="M5 15 L1 15 L1 11" stroke="rgba(255,255,255,0.8)" strokeWidth="1" fill="none" />
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontSize: "0.875rem",
          }}
        >
          No video assigned
        </div>
      )}
    </div>
  );
}
