"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Center, useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

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

function ModelContent({ url, format }: { url: string; format: Format }) {
  return (
    <AutoScale>
      {(format === "glb" || format === "gltf") && <GLTFModel url={url} />}
      {format === "fbx" && <FBXModel url={url} />}
      {format === "obj" && <OBJModel url={url} />}
    </AutoScale>
  );
}

function LoadingSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );
}

function ModelViewerInner({ url, format }: { url: string; format: Format }) {
  return (
    <div className="relative h-full w-full rounded-lg bg-slate-900">
      <Suspense fallback={<LoadingSpinner />}>
        <Canvas
          camera={{ position: [0, 1, 4], fov: 45 }}
          style={{ width: "100%", height: "100%" }}
        >
          <Environment preset="studio" />
          <ambientLight intensity={0.3} />
          <Center>
            <ModelContent url={url} format={format} />
          </Center>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            minDistance={0.5}
            maxDistance={20}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

export const ModelViewer = dynamic(() => Promise.resolve(ModelViewerInner), {
  ssr: false,
  loading: () => <LoadingSpinner />,
});
