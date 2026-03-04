"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import type { Model3DHotspot, PreviewHotspot } from "@/types/model3d";
import { Model3DHotspots } from "./model-3d-hotspot";

/* ------------------------------------------------------------------ */
/*  Format-specific model loaders                                      */
/* ------------------------------------------------------------------ */

type Format = "glb" | "gltf" | "fbx" | "obj";

function GLTFModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function FBXModel({ url }: { url: string }) {
  const fbx = useLoader(FBXLoader, url);
  return <primitive object={fbx} />;
}

function OBJModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  return <primitive object={obj} />;
}

/* ------------------------------------------------------------------ */
/*  AutoScale — normalizes model to fit a 2-unit cube, centered        */
/* ------------------------------------------------------------------ */

function AutoScale({ children }: { children: React.ReactNode }) {
  return (
    <group
      ref={(group) => {
        if (!group) return;
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 2 / maxDim;
          group.scale.setScalar(scale);
        }
        const centeredBox = new THREE.Box3().setFromObject(group);
        const center = centeredBox.getCenter(new THREE.Vector3());
        group.position.sub(center);
      }}
    >
      {children}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  CameraSetup — applies initial camera position/target from metadata */
/* ------------------------------------------------------------------ */

function CameraSetup({
  position,
  target,
}: {
  position?: { x: number; y: number; z: number };
  target?: { x: number; y: number; z: number };
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (position) {
      camera.position.set(position.x, position.y, position.z);
    }
    if (target) {
      camera.lookAt(target.x, target.y, target.z);
    }
    camera.updateProjectionMatrix();
  }, [camera, position, target]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  ZoomBridge — exposes camera zoom functions to parent HTML buttons   */
/* ------------------------------------------------------------------ */

interface ZoomFns {
  zoomIn: () => void;
  zoomOut: () => void;
}

function ZoomBridge({
  zoomRef,
  minDistance,
  maxDistance,
}: {
  zoomRef: React.MutableRefObject<ZoomFns | null>;
  minDistance: number;
  maxDistance: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
  } | null;

  useEffect(() => {
    zoomRef.current = {
      zoomIn: () => {
        const target = controls?.target ?? new THREE.Vector3();
        const dir = camera.position.clone().sub(target);
        const dist = dir.length();
        const newDist = Math.max(dist * 0.85, minDistance);
        dir.normalize().multiplyScalar(newDist);
        camera.position.copy(target.clone().add(dir));
      },
      zoomOut: () => {
        const target = controls?.target ?? new THREE.Vector3();
        const dir = camera.position.clone().sub(target);
        const dist = dir.length();
        const newDist = Math.min(dist * 1.18, maxDistance);
        dir.normalize().multiplyScalar(newDist);
        camera.position.copy(target.clone().add(dir));
      },
    };
  }, [camera, controls, zoomRef, minDistance, maxDistance]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Model3DCanvas — the actual R3F canvas with controls                */
/* ------------------------------------------------------------------ */

interface Model3DCanvasProps {
  url: string;
  format: Format;
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  autoRotateSpeed?: number;
  hotspots?: Model3DHotspot[];
  onHotspotNavigate?: (targetChapter: string) => void;
  onHotspotPreviewClick?: (hotspot: PreviewHotspot) => void;
}

export default function Model3DCanvas({
  url,
  format,
  cameraPosition,
  cameraTarget,
  autoRotateSpeed = 0.5,
  hotspots,
  onHotspotNavigate,
  onHotspotPreviewClick,
}: Model3DCanvasProps) {
  const [hoverPaused, setHoverPaused] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const handleHoverStart = useCallback(() => setHoverPaused(true), []);
  const handleHoverEnd = useCallback(() => setHoverPaused(false), []);
  const zoomRef = useRef<ZoomFns | null>(null);

  // Detect touch device for performance tuning
  useEffect(() => {
    setIsTouch(
      "ontouchstart" in window || navigator.maxTouchPoints > 0
    );
  }, []);

  const controlsTarget = cameraTarget
    ? new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    : undefined;

  const defaultCamera = cameraPosition
    ? [cameraPosition.x, cameraPosition.y, cameraPosition.z] as [number, number, number]
    : [0, 1, 4] as [number, number, number];

  const minDist = isTouch ? 1 : 0.5;
  const maxDist = 20;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        camera={{ position: defaultCamera, fov: 45 }}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
        gl={{ antialias: !isTouch, toneMapping: THREE.ACESFilmicToneMapping }}
        dpr={isTouch ? [1, 1.5] : [1, 2]}
      >
        {/* Lighting */}
        <Environment preset="city" />
        <ambientLight intensity={0.2} />
        <directionalLight position={[5, 5, 5]} intensity={0.5} />

        {/* Camera override from metadata */}
        {cameraPosition && (
          <CameraSetup position={cameraPosition} target={cameraTarget} />
        )}

        {/* Model + hotspots (inside AutoScale so coords match) */}
        <AutoScale>
          {(format === "glb" || format === "gltf") && <GLTFModel url={url} />}
          {format === "fbx" && <FBXModel url={url} />}
          {format === "obj" && <OBJModel url={url} />}

          {hotspots && hotspots.length > 0 && (
            <Model3DHotspots
              hotspots={hotspots}
              onNavigate={onHotspotNavigate}
              onPreviewClick={onHotspotPreviewClick}
              onHoverStart={handleHoverStart}
              onHoverEnd={handleHoverEnd}
            />
          )}
        </AutoScale>

        {/* Controls — scroll zoom disabled so wheel scrolls the presentation */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={isTouch ? 0.12 : 0.08}
          autoRotate={autoRotateSpeed > 0 && !hoverPaused}
          autoRotateSpeed={autoRotateSpeed}
          minDistance={minDist}
          maxDistance={maxDist}
          target={controlsTarget}
          enablePan={false}
          enableZoom={false}
          rotateSpeed={isTouch ? 0.5 : 1}
        />

        {/* Bridge to expose zoom functions to HTML overlay buttons */}
        <ZoomBridge zoomRef={zoomRef} minDistance={minDist} maxDistance={maxDist} />
      </Canvas>

      {/* Zoom +/- buttons — bottom right overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => zoomRef.current?.zoomIn()}
          data-cursor-label="Zoom"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="2" x2="7" y2="12" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
            <line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={() => zoomRef.current?.zoomOut()}
          data-cursor-label="Zoom"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="2" y1="7" x2="12" y2="7" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
