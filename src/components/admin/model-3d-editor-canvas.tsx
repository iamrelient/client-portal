"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF, Html } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import type { Model3DHotspot } from "@/types/model3d";
import type { CameraState } from "./model-3d-editor";

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
/*  CameraReporter — writes camera state to ref every frame            */
/* ------------------------------------------------------------------ */

function CameraReporter({
  stateRef,
  controlsRef,
}: {
  stateRef: MutableRefObject<CameraState>;
  controlsRef: MutableRefObject<{ target: THREE.Vector3 } | null>;
}) {
  const { camera } = useThree();

  useFrame(() => {
    stateRef.current.position.x = camera.position.x;
    stateRef.current.position.y = camera.position.y;
    stateRef.current.position.z = camera.position.z;

    const controls = controlsRef.current;
    if (controls) {
      stateRef.current.target.x = controls.target.x;
      stateRef.current.target.y = controls.target.y;
      stateRef.current.target.z = controls.target.z;
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Hotspot markers (simplified for admin preview)                     */
/* ------------------------------------------------------------------ */

function EditorHotspotMarkers({ hotspots }: { hotspots: Model3DHotspot[] }) {
  if (hotspots.length === 0) return null;

  return (
    <>
      {hotspots.map((hs) => (
        <Html
          key={hs.id}
          position={[hs.position.x, hs.position.y, hs.position.z]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background:
                hs.type === "navigate"
                  ? "rgba(59,130,246,0.25)"
                  : "rgba(245,158,11,0.25)",
              border: `1.5px solid ${
                hs.type === "navigate"
                  ? "rgba(59,130,246,0.6)"
                  : "rgba(245,158,11,0.6)"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color:
                hs.type === "navigate"
                  ? "rgba(96,165,250,0.9)"
                  : "rgba(251,191,36,0.9)",
            }}
          >
            {hs.type === "navigate" ? "N" : "P"}
          </div>
          <div
            style={{
              position: "absolute",
              top: 28,
              left: "50%",
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              fontSize: 9,
              color: "rgba(255,255,255,0.6)",
              textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            }}
          >
            {hs.label}
          </div>
        </Html>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Model3DEditorCanvas — the R3F canvas for the admin editor          */
/* ------------------------------------------------------------------ */

interface Model3DEditorCanvasProps {
  url: string;
  format: Format;
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  autoRotateSpeed?: number;
  hotspots: Model3DHotspot[];
  cameraStateRef: MutableRefObject<CameraState>;
}

export default function Model3DEditorCanvas({
  url,
  format,
  cameraPosition,
  cameraTarget,
  autoRotateSpeed = 0.5,
  hotspots,
  cameraStateRef,
}: Model3DEditorCanvasProps) {
  const controlsRef = useRef<{ target: THREE.Vector3 } | null>(null);

  const controlsTarget = cameraTarget
    ? new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z)
    : undefined;

  const defaultCamera = cameraPosition
    ? ([cameraPosition.x, cameraPosition.y, cameraPosition.z] as [number, number, number])
    : ([0, 1, 4] as [number, number, number]);

  return (
    <Canvas
      camera={{ position: defaultCamera, fov: 45 }}
      style={{ width: "100%", height: "100%", minHeight: 320 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      {/* Lighting */}
      <Environment preset="city" />
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />

      {/* Camera override from metadata */}
      {cameraPosition && (
        <CameraSetup position={cameraPosition} target={cameraTarget} />
      )}

      {/* Camera reporter — writes to ref every frame */}
      <CameraReporter stateRef={cameraStateRef} controlsRef={controlsRef} />

      {/* Model + hotspot markers */}
      <AutoScale>
        {(format === "glb" || format === "gltf") && <GLTFModel url={url} />}
        {format === "fbx" && <FBXModel url={url} />}
        {format === "obj" && <OBJModel url={url} />}

        <EditorHotspotMarkers hotspots={hotspots} />
      </AutoScale>

      {/* Controls */}
      <OrbitControls
        ref={controlsRef as React.Ref<never>}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotateSpeed > 0}
        autoRotateSpeed={autoRotateSpeed}
        minDistance={0.5}
        maxDistance={20}
        target={controlsTarget}
        enablePan={false}
      />
    </Canvas>
  );
}
