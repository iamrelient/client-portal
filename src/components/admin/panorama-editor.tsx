"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PanoramaMetadata, PanoramaHotspot } from "@/types/panorama";
import { PanoramaHotspotForm } from "./panorama-hotspot-form";
import { PanoramaFloorPlanEditor } from "./panorama-floor-plan-editor";
import { Crosshair, RotateCcw, Save, Loader2 } from "lucide-react";

interface PannellumViewer {
  getPitch: () => number;
  getYaw: () => number;
  getHfov: () => number;
  setPitch: (p: number) => void;
  setYaw: (y: number) => void;
  setHfov: (h: number) => void;
  mouseEventToCoords: (e: MouseEvent) => [number, number];
  destroy: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface PannellumGlobal {
  viewer: (el: HTMLElement, config: Record<string, unknown>) => PannellumViewer;
}

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
  metadata: Record<string, unknown> | null;
}

interface PanoramaEditorProps {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
  allSections: SectionOption[];
  projectFiles: FileOption[];
  onSave: (metadata: PanoramaMetadata) => Promise<void>;
}

type Tab = "hotspots" | "initial-view" | "floor-plan" | "tour";

let pannellumLoaded = false;
let pannellumLoadPromise: Promise<void> | null = null;

function loadPannellum(): Promise<void> {
  if (pannellumLoaded) return Promise.resolve();
  if (pannellumLoadPromise) return pannellumLoadPromise;

  pannellumLoadPromise = new Promise<void>((resolve) => {
    if (document.querySelector('link[href="/pannellum/pannellum.css"]')) {
      // Already have CSS
    } else {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/pannellum/pannellum.css";
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector(
      'script[src="/pannellum/pannellum.js"]'
    );
    if (existingScript) {
      pannellumLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "/pannellum/pannellum.js";
    script.onload = () => {
      pannellumLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });

  return pannellumLoadPromise;
}

export function PanoramaEditor({
  sectionId,
  imageUrl,
  metadata: initialMetadata,
  allSections,
  projectFiles,
  onSave,
}: PanoramaEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("hotspots");
  const [saving, setSaving] = useState(false);

  // Local editable metadata
  const [meta, setMeta] = useState<PanoramaMetadata>({
    initialView: initialMetadata.initialView || { pitch: 0, yaw: 180 },
    hotspots: initialMetadata.hotspots || [],
    floorPlan: initialMetadata.floorPlan || undefined,
    roomLabel: initialMetadata.roomLabel || "",
    tourGroupId: initialMetadata.tourGroupId || "",
  });

  // Hotspot editing state
  const [placingHotspot, setPlacingHotspot] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{
    pitch: number;
    yaw: number;
  } | null>(null);
  const [editingHotspotId, setEditingHotspotId] = useState<string | null>(null);

  // Panorama sections for navigation targets (exclude self)
  const panoramaSections = allSections.filter(
    (s) => s.type === "panorama" && s.id !== sectionId
  );

  // Initialize Pannellum
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let destroyed = false;

    loadPannellum().then(() => {
      if (destroyed || !containerRef.current) return;

      const pannellum = (window as unknown as { pannellum: PannellumGlobal })
        .pannellum;

      viewerRef.current = pannellum.viewer(containerRef.current!, {
        type: "equirectangular",
        panorama: imageUrl,
        autoLoad: true,
        autoRotate: 0,
        compass: false,
        showControls: false,
        showFullscreenCtrl: false,
        hfov: 110,
        mouseZoom: true,
        draggable: true,
        pitch: meta.initialView?.pitch || 0,
        yaw: meta.initialView?.yaw || 180,
      });

      setReady(true);
    });

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      setReady(false);
    };
    // Only re-init when imageUrl changes, not metadata
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Handle click-to-place hotspot
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready || !placingHotspot) return;

    function handleClick(e: MouseEvent) {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // Pannellum's mouseEventToCoords returns [pitch, yaw]
      const coords = viewer.mouseEventToCoords(e);
      if (!coords) return;

      setPendingCoords({ pitch: coords[0], yaw: coords[1] });
      setPlacingHotspot(false);
    }

    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [ready, placingHotspot]);

  const handleSaveHotspot = useCallback(
    (hotspot: PanoramaHotspot) => {
      setMeta((prev) => {
        const existing = prev.hotspots || [];
        const idx = existing.findIndex((h) => h.id === hotspot.id);
        const updated =
          idx >= 0
            ? existing.map((h, i) => (i === idx ? hotspot : h))
            : [...existing, hotspot];
        return { ...prev, hotspots: updated };
      });
      setPendingCoords(null);
      setEditingHotspotId(null);
    },
    []
  );

  const handleDeleteHotspot = useCallback((id: string) => {
    setMeta((prev) => ({
      ...prev,
      hotspots: (prev.hotspots || []).filter((h) => h.id !== id),
    }));
    setEditingHotspotId(null);
  }, []);

  const handleCaptureView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setMeta((prev) => ({
      ...prev,
      initialView: {
        pitch: Math.round(viewer.getPitch() * 10) / 10,
        yaw: Math.round(viewer.getYaw() * 10) / 10,
      },
    }));
  }, []);

  const handleResetView = useCallback(() => {
    setMeta((prev) => ({
      ...prev,
      initialView: { pitch: 0, yaw: 180 },
    }));
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.setPitch(0);
      viewer.setYaw(180);
    }
  }, []);

  async function handleSave() {
    setSaving(true);
    // Clean empty strings
    const cleaned: PanoramaMetadata = { ...meta };
    if (!cleaned.roomLabel) delete cleaned.roomLabel;
    if (!cleaned.tourGroupId) delete cleaned.tourGroupId;
    if (!cleaned.floorPlan) delete cleaned.floorPlan;
    if (cleaned.hotspots?.length === 0) delete cleaned.hotspots;
    await onSave(cleaned);
    setSaving(false);
  }

  const editingHotspot = editingHotspotId
    ? (meta.hotspots || []).find((h) => h.id === editingHotspotId) || null
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "hotspots", label: "Hotspots" },
    { key: "initial-view", label: "Initial View" },
    { key: "floor-plan", label: "Floor Plan" },
    { key: "tour", label: "Tour" },
  ];

  const inputClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none";

  return (
    <div className="border-t border-white/[0.06] bg-white/[0.02]">
      <div className="grid lg:grid-cols-2 gap-0">
        {/* Left: Pannellum preview */}
        <div className="relative" style={{ minHeight: 320 }}>
          <div
            ref={containerRef}
            style={{ width: "100%", height: "100%", minHeight: 320 }}
          />

          {/* Placement mode indicator */}
          {placingHotspot && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-brand-600/90 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <Crosshair className="h-3.5 w-3.5" />
              Click to place hotspot
            </div>
          )}

          {/* Hotspot markers overlay */}
          {ready && (meta.hotspots || []).length > 0 && (
            <div className="absolute bottom-3 left-3 z-10 text-[10px] text-slate-400 bg-black/50 rounded px-2 py-1 backdrop-blur-sm">
              {(meta.hotspots || []).length} hotspot
              {(meta.hotspots || []).length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Hide pannellum defaults */}
          <style>{`
            .pnlm-about-msg, .pnlm-load-box, .pnlm-compass, .pnlm-controls-container {
              display: none !important;
            }
          `}</style>
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
            {/* Hotspots tab */}
            {activeTab === "hotspots" && (
              <div className="space-y-3">
                {/* Show form when placing or editing */}
                {pendingCoords && (
                  <PanoramaHotspotForm
                    hotspot={null}
                    pitch={pendingCoords.pitch}
                    yaw={pendingCoords.yaw}
                    panoramaSections={panoramaSections}
                    projectFiles={projectFiles}
                    onSave={handleSaveHotspot}
                    onCancel={() => setPendingCoords(null)}
                  />
                )}

                {editingHotspot && (
                  <PanoramaHotspotForm
                    hotspot={editingHotspot}
                    pitch={editingHotspot.pitch}
                    yaw={editingHotspot.yaw}
                    panoramaSections={panoramaSections}
                    projectFiles={projectFiles}
                    onSave={handleSaveHotspot}
                    onCancel={() => setEditingHotspotId(null)}
                    onDelete={() => handleDeleteHotspot(editingHotspot.id)}
                  />
                )}

                {/* Add hotspot button */}
                {!pendingCoords && !editingHotspotId && (
                  <>
                    <button
                      onClick={() => setPlacingHotspot(!placingHotspot)}
                      className={`w-full rounded-lg border border-dashed px-3 py-2 text-xs font-medium transition-colors ${
                        placingHotspot
                          ? "border-brand-500 text-brand-400 bg-brand-500/10"
                          : "border-white/[0.15] text-slate-400 hover:text-white hover:border-white/[0.3]"
                      }`}
                    >
                      {placingHotspot
                        ? "Click on panorama to place..."
                        : "+ Add Hotspot"}
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
                            hs.type === "navigation"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {hs.type === "navigation" ? "N" : "i"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-200 truncate">
                            {hs.label}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {hs.type} &middot; {hs.pitch.toFixed(0)},{" "}
                            {hs.yaw.toFixed(0)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Initial View tab */}
            {activeTab === "initial-view" && (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">
                  Pan the panorama to your desired starting position, then
                  capture the view.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCaptureView}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                  >
                    <Crosshair className="h-3 w-3" />
                    Set Current View
                  </button>
                  <button
                    onClick={handleResetView}
                    className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Pitch</span>
                    <span className="text-slate-300 font-mono">
                      {meta.initialView?.pitch ?? 0}°
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Yaw</span>
                    <span className="text-slate-300 font-mono">
                      {meta.initialView?.yaw ?? 180}°
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Floor Plan tab */}
            {activeTab === "floor-plan" && (
              <PanoramaFloorPlanEditor
                floorPlan={meta.floorPlan}
                projectFiles={projectFiles}
                onChange={(fp) => setMeta((prev) => ({ ...prev, floorPlan: fp }))}
              />
            )}

            {/* Tour Settings tab */}
            {activeTab === "tour" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">
                    Room Label
                  </label>
                  <input
                    type="text"
                    value={meta.roomLabel || ""}
                    onChange={(e) =>
                      setMeta((prev) => ({
                        ...prev,
                        roomLabel: e.target.value,
                      }))
                    }
                    placeholder="e.g. Living Room, Kitchen"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">
                    Tour Group ID
                  </label>
                  <input
                    type="text"
                    value={meta.tourGroupId || ""}
                    onChange={(e) =>
                      setMeta((prev) => ({
                        ...prev,
                        tourGroupId: e.target.value,
                      }))
                    }
                    placeholder="e.g. main-tour (shared across rooms)"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Panoramas with the same Tour Group ID are linked into one
                    walkthrough.
                  </p>
                </div>
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
