"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Crosshair, RotateCcw, Save, Loader2 } from "lucide-react";
import type { Model3DMetadata, Model3DHotspot } from "@/types/model3d";
import { Model3DHotspotForm } from "./model-3d-hotspot-form";

/* ------------------------------------------------------------------ */
/*  Lazy-loaded 3D preview canvas (SSR disabled)                       */
/* ------------------------------------------------------------------ */

const Model3DEditorCanvas = dynamic(() => import("./model-3d-editor-canvas"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060608",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "2px solid rgba(255,255,255,0.1)",
          borderTopColor: "rgba(255,255,255,0.4)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FileOption {
  id: string;
  originalName: string;
  mimeType: string;
}

interface SectionOption {
  id: string;
  title: string | null;
  type: string;
  order: number;
  chapter: string | null;
  metadata: Record<string, unknown> | null;
}

interface Model3DEditorProps {
  fileUrl: string;
  fileName: string;
  metadata: Model3DMetadata;
  allSections: SectionOption[];
  projectFiles: FileOption[];
  onSave: (metadata: Model3DMetadata) => Promise<void>;
}

export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

type Tab = "camera" | "hotspots";

/* ------------------------------------------------------------------ */
/*  Model3DEditor — main editor component                             */
/* ------------------------------------------------------------------ */

export function Model3DEditor({
  fileUrl,
  fileName,
  metadata: initialMetadata,
  allSections,
  projectFiles,
  onSave,
}: Model3DEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("camera");
  const [saving, setSaving] = useState(false);

  // Camera state ref — written by CameraReporter inside the canvas
  const cameraStateRef = useRef<CameraState>({
    position: initialMetadata.cameraPosition || { x: 0, y: 1, z: 4 },
    target: initialMetadata.cameraTarget || { x: 0, y: 0, z: 0 },
  });

  // Local editable metadata
  const [meta, setMeta] = useState<Model3DMetadata>({
    cameraPosition: initialMetadata.cameraPosition || undefined,
    cameraTarget: initialMetadata.cameraTarget || undefined,
    autoRotateSpeed: initialMetadata.autoRotateSpeed ?? 0.5,
    hotspots: initialMetadata.hotspots || [],
  });

  // Camera form fields
  const [camPosX, setCamPosX] = useState(meta.cameraPosition?.x ?? 0);
  const [camPosY, setCamPosY] = useState(meta.cameraPosition?.y ?? 1);
  const [camPosZ, setCamPosZ] = useState(meta.cameraPosition?.z ?? 4);
  const [camTargX, setCamTargX] = useState(meta.cameraTarget?.x ?? 0);
  const [camTargY, setCamTargY] = useState(meta.cameraTarget?.y ?? 0);
  const [camTargZ, setCamTargZ] = useState(meta.cameraTarget?.z ?? 0);
  const [autoRotateSpeed, setAutoRotateSpeed] = useState(
    meta.autoRotateSpeed ?? 0.5
  );

  // Sync camera fields → meta
  useEffect(() => {
    setMeta((prev) => ({
      ...prev,
      cameraPosition: { x: camPosX, y: camPosY, z: camPosZ },
      cameraTarget: { x: camTargX, y: camTargY, z: camTargZ },
      autoRotateSpeed,
    }));
  }, [camPosX, camPosY, camPosZ, camTargX, camTargY, camTargZ, autoRotateSpeed]);

  // Hotspot editing state
  const [editingHotspotId, setEditingHotspotId] = useState<string | null>(null);
  const [addingHotspot, setAddingHotspot] = useState(false);

  /* ---- Camera handlers ---- */

  const handleCaptureView = useCallback(() => {
    const state = cameraStateRef.current;
    const round = (n: number) => Math.round(n * 100) / 100;
    setCamPosX(round(state.position.x));
    setCamPosY(round(state.position.y));
    setCamPosZ(round(state.position.z));
    setCamTargX(round(state.target.x));
    setCamTargY(round(state.target.y));
    setCamTargZ(round(state.target.z));
  }, []);

  const handleResetView = useCallback(() => {
    setCamPosX(0);
    setCamPosY(1);
    setCamPosZ(4);
    setCamTargX(0);
    setCamTargY(0);
    setCamTargZ(0);
    setAutoRotateSpeed(0.5);
  }, []);

  /* ---- Hotspot handlers ---- */

  const handleSaveHotspot = useCallback((hotspot: Model3DHotspot) => {
    setMeta((prev) => {
      const existing = prev.hotspots || [];
      const idx = existing.findIndex((h) => h.id === hotspot.id);
      const updated =
        idx >= 0
          ? existing.map((h, i) => (i === idx ? hotspot : h))
          : [...existing, hotspot];
      return { ...prev, hotspots: updated };
    });
    setAddingHotspot(false);
    setEditingHotspotId(null);
  }, []);

  const handleDeleteHotspot = useCallback((id: string) => {
    setMeta((prev) => ({
      ...prev,
      hotspots: (prev.hotspots || []).filter((h) => h.id !== id),
    }));
    setEditingHotspotId(null);
  }, []);

  /* ---- Save ---- */

  async function handleSave() {
    setSaving(true);
    const cleaned: Model3DMetadata = { ...meta };
    if (!cleaned.hotspots?.length) delete cleaned.hotspots;
    // Remove default camera values if they match defaults
    if (
      cleaned.cameraPosition?.x === 0 &&
      cleaned.cameraPosition?.y === 1 &&
      cleaned.cameraPosition?.z === 4
    ) {
      delete cleaned.cameraPosition;
    }
    if (
      cleaned.cameraTarget?.x === 0 &&
      cleaned.cameraTarget?.y === 0 &&
      cleaned.cameraTarget?.z === 0
    ) {
      delete cleaned.cameraTarget;
    }
    if (cleaned.autoRotateSpeed === 0.5) {
      delete cleaned.autoRotateSpeed;
    }
    await onSave(cleaned);
    setSaving(false);
  }

  const editingHotspot = editingHotspotId
    ? (meta.hotspots || []).find((h) => h.id === editingHotspotId) || null
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "camera", label: "Camera" },
    { key: "hotspots", label: "Hotspots" },
  ];

  const numClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-xs text-white font-mono focus:border-brand-500 focus:outline-none";

  // Determine format from file name
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const formatMap: Record<string, "glb" | "gltf" | "fbx" | "obj"> = {
    ".glb": "glb",
    ".gltf": "gltf",
    ".fbx": "fbx",
    ".obj": "obj",
  };
  const format = formatMap[ext] || "glb";

  return (
    <div className="border-t border-white/[0.06] bg-white/[0.02]">
      <div className="grid lg:grid-cols-2 gap-0">
        {/* Left: 3D preview */}
        <div className="relative" style={{ minHeight: 320, background: "#060608" }}>
          <Model3DEditorCanvas
            url={fileUrl}
            format={format}
            cameraPosition={meta.cameraPosition}
            cameraTarget={meta.cameraTarget}
            autoRotateSpeed={autoRotateSpeed}
            hotspots={meta.hotspots || []}
            cameraStateRef={cameraStateRef}
          />

          {/* Hotspot count badge */}
          {(meta.hotspots || []).length > 0 && (
            <div className="absolute bottom-3 left-3 z-10 text-[10px] text-slate-400 bg-black/50 rounded px-2 py-1 backdrop-blur-sm">
              {(meta.hotspots || []).length} hotspot
              {(meta.hotspots || []).length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Right: Config panel */}
        <div className="border-l border-white/[0.06] flex flex-col max-h-[480px]">
          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-3 py-2.5 text-[11px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? "text-white border-b-2 border-brand-500 -mb-px"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Camera tab */}
            {activeTab === "camera" && (
              <div className="space-y-4">
                {/* Camera Position */}
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1.5">
                    Camera Position (X, Y, Z)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      value={camPosX}
                      onChange={(e) => setCamPosX(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="X"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={camPosY}
                      onChange={(e) => setCamPosY(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="Y"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={camPosZ}
                      onChange={(e) => setCamPosZ(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="Z"
                    />
                  </div>
                </div>

                {/* Camera Target */}
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1.5">
                    Camera Target (X, Y, Z)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      value={camTargX}
                      onChange={(e) => setCamTargX(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="X"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={camTargY}
                      onChange={(e) => setCamTargY(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="Y"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={camTargZ}
                      onChange={(e) => setCamTargZ(parseFloat(e.target.value) || 0)}
                      className={numClass}
                      placeholder="Z"
                    />
                  </div>
                </div>

                {/* Capture / Reset */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureView}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                  >
                    <Crosshair className="h-3 w-3" />
                    Capture Current View
                  </button>
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                    title="Reset to defaults"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>

                {/* Auto-rotate Speed */}
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1.5">
                    Auto-Rotate Speed
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={autoRotateSpeed}
                      onChange={(e) =>
                        setAutoRotateSpeed(parseFloat(e.target.value))
                      }
                      className="flex-1 accent-brand-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={autoRotateSpeed}
                      onChange={(e) =>
                        setAutoRotateSpeed(parseFloat(e.target.value) || 0)
                      }
                      className="w-16 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-xs text-white font-mono focus:border-brand-500 focus:outline-none text-center"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    0 = no rotation. Default is 0.5.
                  </p>
                </div>

                {/* Current values summary */}
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Position</span>
                    <span className="text-slate-300 font-mono">
                      {camPosX}, {camPosY}, {camPosZ}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Target</span>
                    <span className="text-slate-300 font-mono">
                      {camTargX}, {camTargY}, {camTargZ}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Rotate Speed</span>
                    <span className="text-slate-300 font-mono">
                      {autoRotateSpeed}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Hotspots tab */}
            {activeTab === "hotspots" && (
              <div className="space-y-3">
                {/* Adding new hotspot form */}
                {addingHotspot && (
                  <Model3DHotspotForm
                    hotspot={null}
                    allSections={allSections}
                    projectFiles={projectFiles}
                    onSave={handleSaveHotspot}
                    onCancel={() => setAddingHotspot(false)}
                  />
                )}

                {/* Editing existing hotspot form */}
                {editingHotspot && (
                  <Model3DHotspotForm
                    hotspot={editingHotspot}
                    allSections={allSections}
                    projectFiles={projectFiles}
                    onSave={handleSaveHotspot}
                    onCancel={() => setEditingHotspotId(null)}
                    onDelete={() => handleDeleteHotspot(editingHotspot.id)}
                  />
                )}

                {/* Add hotspot button + list (when not editing) */}
                {!addingHotspot && !editingHotspotId && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAddingHotspot(true)}
                      className="w-full rounded-lg border border-dashed border-white/[0.15] px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:border-white/[0.3] transition-colors"
                    >
                      + Add Hotspot
                    </button>

                    {/* Hotspot list */}
                    {(meta.hotspots || []).map((hs) => (
                      <button
                        key={hs.id}
                        onClick={() => setEditingHotspotId(hs.id)}
                        className="w-full flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
                      >
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            hs.type === "navigate"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {hs.type === "navigate" ? "N" : "P"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-200 truncate">
                            {hs.label}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {hs.type} &middot;{" "}
                            {hs.position.x.toFixed(1)}, {hs.position.y.toFixed(1)},{" "}
                            {hs.position.z.toFixed(1)}
                          </div>
                        </div>
                      </button>
                    ))}

                    {(meta.hotspots || []).length === 0 && (
                      <p className="text-[11px] text-slate-500 text-center py-4">
                        No hotspots yet. Add one to mark points of interest on
                        the 3D model.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="border-t border-white/[0.06] px-4 py-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
