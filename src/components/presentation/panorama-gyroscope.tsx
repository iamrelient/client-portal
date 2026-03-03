"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { PanoramaViewerHandle } from "./panorama-viewer";

interface GyroscopeState {
  isSupported: boolean;
  isEnabled: boolean;
  toggle: () => void;
}

export function useGyroscope(
  viewerRef: React.RefObject<PanoramaViewerHandle | null>
): GyroscopeState {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const enabledRef = useRef(false);
  const lastAlpha = useRef<number | null>(null);
  const lastBeta = useRef<number | null>(null);

  // Check support on mount
  useEffect(() => {
    setIsSupported("DeviceOrientationEvent" in window);
  }, []);

  // Handle device orientation
  useEffect(() => {
    if (!isEnabled || !permissionGranted) return;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (!enabledRef.current) return;
      const viewer = viewerRef.current;
      if (!viewer) return;

      const alpha = e.alpha; // compass direction (0-360)
      const beta = e.beta; // front-back tilt (-180 to 180)

      if (alpha === null || beta === null) return;

      // Smoothing
      const smoothing = 0.15;

      if (lastAlpha.current !== null && lastBeta.current !== null) {
        // Map alpha to yaw
        let deltaAlpha = alpha - lastAlpha.current;
        if (deltaAlpha > 180) deltaAlpha -= 360;
        if (deltaAlpha < -180) deltaAlpha += 360;

        const currentYaw = viewer.getYaw();
        const currentPitch = viewer.getPitch();

        viewer.setYaw(currentYaw + deltaAlpha * smoothing);

        // Map beta to pitch (offset so holding phone ~45° = level view)
        const targetPitch = -(beta - 45);
        viewer.setPitch(currentPitch + (targetPitch - currentPitch) * smoothing);
      }

      lastAlpha.current = alpha;
      lastBeta.current = beta;
    }

    window.addEventListener("deviceorientation", handleOrientation);
    return () =>
      window.removeEventListener("deviceorientation", handleOrientation);
  }, [isEnabled, permissionGranted, viewerRef]);

  const toggle = useCallback(async () => {
    if (!isSupported) return;

    if (isEnabled) {
      setIsEnabled(false);
      enabledRef.current = false;
      lastAlpha.current = null;
      lastBeta.current = null;
      return;
    }

    // iOS 13+ requires permission request from user gesture
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };

    if (doe.requestPermission) {
      try {
        const result = await doe.requestPermission();
        if (result === "granted") {
          setPermissionGranted(true);
          setIsEnabled(true);
          enabledRef.current = true;
          // Haptic feedback on Android
          if (navigator.vibrate) navigator.vibrate(10);
        }
      } catch {
        // Permission denied or error
      }
    } else {
      // Android — no permission needed
      setPermissionGranted(true);
      setIsEnabled(true);
      enabledRef.current = true;
      if (navigator.vibrate) navigator.vibrate(10);
    }
  }, [isSupported, isEnabled]);

  return { isSupported, isEnabled, toggle };
}
