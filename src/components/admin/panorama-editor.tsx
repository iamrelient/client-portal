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
  addHotSpot: (config: Record<string, unknown>, sceneId?: string) => void;
  removeHotSpot: (id: string, sceneId?: string) => boolean;
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
  /** Backing file id — used by the drag-to-link rail to pull a real
   *  panorama thumbnail. Optional so non-file sections still typecheck. */
  fileId?: string | null;
  metadata: Record<string, unknown> | null;
  /** Used as a friendly fallback label in the Target Room dropdown so
   *  panoramas without a roomLabel / title don't read as the
   *  unrecognizable "Panorama cmpy0j". */
  file?: { originalName: string } | null;
}

interface PanoramaEditorProps {
  sectionId: string;
  imageUrl: string;
  metadata: PanoramaMetadata;
  allSections: SectionOption[];
  projectFiles: FileOption[];
  onSave: (metadata: PanoramaMetadata) => Promise<void>;
  /** Optional: triggered from the "+ Add" button next to a Navigation
   *  hotspot's Target Room dropdown. Lets the admin pick or upload
   *  another 360° image and creates a fresh panorama section for it.
   *  Resolves to the new section's id (auto-selected by the form),
   *  or null if the picker was dismissed. */
  onAddPanorama?: () => Promise<string | null>;
  /** Optional: triggered from the "+ Add" button in the Floor Plan
   *  tab. Lets the admin pick or upload a floor plan image for this
   *  panorama. Resolves to the file id (auto-selected), or null if
   *  the picker was dismissed. */
  onAddFloorPlan?: () => Promise<string | null>;
  /** Drag-to-link callback. Called when the admin drops another
   *  panorama's thumbnail onto the 360° view. The page is responsible
   *  for PATCHing a *reverse* navigation hotspot into the dropped
   *  panorama (so both rooms point at each other) — we've already
   *  saved the forward hotspot via `onSave` before this fires.
   *  Pitch/Yaw are the forward hotspot's coordinates so the page can
   *  flip yaw by 180° for a sensible default return location. */
  onLinkPanorama?: (args: {
    fromSectionId: string;
    toSectionId: string;
    forwardPitch: number;
    forwardYaw: number;
  }) => Promise<void>;
  /** Called after a drag-to-link drop finishes saving on both sides,
   *  asking the page to switch the expanded editor to the target
   *  panorama so the admin lands in the room they just walked into. */
  onSwitchToPanorama?: (sectionId: string) => void;
}

type Tab = "hotspots" | "initial-view" | "floor-plan";

let pannellumLoaded = false;
let pannellumLoadPromise: Promise<void> | null = null;

/** Build a Pannellum hot-spot config that draws a simple marker in the
 *  editor preview — a blue arrow circle for navigation hotspots, an
 *  amber "i" for info ones, with the label always visible. Navigation
 *  hotspots are clickable: clicking switches the editor to the target
 *  panorama's editor, so admins can walk their tour while authoring
 *  it (same auto-switch the drag-to-link flow does, just initiated
 *  from a different gesture).
 *
 *  This is intentionally simpler than the production client viewer so
 *  admins can immediately see *where* a hotspot landed without
 *  worrying about hover-to-reveal animations. */
function buildEditorHotspotConfig(
  hs: PanoramaHotspot,
  onSwitchToPanorama?: (sectionId: string) => void
): Record<string, unknown> {
  const isNav = hs.type === "navigation";
  return {
    id: hs.id,
    pitch: hs.pitch,
    yaw: hs.yaw,
    type: "info",
    cssClass: "editor-hotspot",
    // Pannellum invokes this as `createTooltipFunc(hotSpotDiv, args)` and
    // expects us to *modify* hotSpotDiv directly. Returning a new
    // element doesn't attach it to anything (that mistake is why the
    // markers were invisible). We append our custom content here.
    createTooltipFunc: (hotSpotDiv: HTMLElement) => {
      const wrapper = document.createElement("div");
      // Nav hotspots get pointer-events: auto so the click handler
      // below fires. Info hotspots stay click-through for now — the
      // form-based editor handles editing them.
      wrapper.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-14px, -14px);
        pointer-events: ${isNav && onSwitchToPanorama ? "auto" : "none"};
        cursor: ${isNav && onSwitchToPanorama ? "pointer" : "default"};
      `;
      wrapper.title = isNav && onSwitchToPanorama
        ? "Click to jump to this room's editor"
        : hs.label;
      wrapper.innerHTML = `
        <div style="
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid white;
          background: ${isNav ? "rgba(59,130,246,0.85)" : "rgba(245,158,11,0.85)"};
          box-shadow: 0 2px 12px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
        ">${isNav ? "↗" : "i"}</div>
        <span style="
          margin-top: 4px;
          font-size: 10px;
          color: white;
          background: rgba(0,0,0,0.6);
          padding: 2px 6px;
          border-radius: 3px;
          white-space: nowrap;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${hs.label.replace(/[<>&]/g, "")}</span>
      `;

      if (isNav && onSwitchToPanorama) {
        const navHs = hs as Extract<PanoramaHotspot, { type: "navigation" }>;
        wrapper.addEventListener("click", (e) => {
          e.stopPropagation();
          onSwitchToPanorama(navHs.targetSectionId);
        });
      }

      hotSpotDiv.appendChild(wrapper);
    },
    createTooltipArgs: "",
  };
}

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

/** Friendly label for a panorama section — mirrors the helper in the
 *  floor plan map so a room's name reads the same everywhere. */
function panoramaLabel(s: SectionOption): string {
  const meta = (s.metadata || {}) as PanoramaMetadata;
  const roomLabel = meta.roomLabel?.trim();
  if (roomLabel) return roomLabel;
  if (s.title?.trim()) return s.title.trim();
  const fromFile = s.file?.originalName?.replace(/\.[^.]+$/, "");
  if (fromFile) return fromFile;
  return `Panorama ${s.id.slice(0, 6)}`;
}

export function PanoramaEditor({
  sectionId,
  imageUrl,
  metadata: initialMetadata,
  allSections,
  projectFiles,
  onSave,
  onAddPanorama,
  onAddFloorPlan,
  onLinkPanorama,
  onSwitchToPanorama,
}: PanoramaEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  /** IDs of hotspots currently mounted in the Pannellum viewer, so the
   *  sync effect knows what to remove on the next pass. */
  const mountedHotspotIdsRef = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("hotspots");
  const [saving, setSaving] = useState(false);
  /** Snapshot of the last persisted metadata so we can tell when there
   *  are unsaved local edits and prompt the admin to hit Save. */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(() =>
    JSON.stringify(initialMetadata)
  );

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

  /** Drag-to-link state. Tracks which panorama (from the bottom rail)
   *  is currently being hauled onto the 360° view, so we can show a
   *  drop indicator and toggle cursor styling on the canvas. */
  const [draggingLinkTargetId, setDraggingLinkTargetId] = useState<
    string | null
  >(null);
  /** True from "save forward + reverse hotspots" through "switch
   *  editor" so the canvas can show a brief overlay instead of letting
   *  the admin start another drag mid-operation. */
  const [linking, setLinking] = useState(false);

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

      // Build the initial hotspot configs from current meta so they
      // appear the instant the panorama image finishes loading — no
      // race between Pannellum init and our sync useEffect.
      const initialHotspots = (meta.hotspots ?? []).map((hs) =>
        buildEditorHotspotConfig(hs, onSwitchToPanorama)
      );
      mountedHotspotIdsRef.current = new Set(
        (meta.hotspots ?? []).map((h) => h.id)
      );

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
        hotSpots: initialHotspots,
      });

      // Wait for the image to actually finish loading before flagging
      // ready — addHotSpot calls before "load" can silently no-op.
      viewerRef.current.on("load", () => {
        if (!destroyed) setReady(true);
      });
      // Fallback: if for some reason "load" never fires (cached image,
      // synchronous decode), make sure ready still flips eventually.
      setTimeout(() => {
        if (!destroyed && !viewerRef.current) return;
        if (!destroyed) setReady(true);
      }, 1500);
    });

    return () => {
      destroyed = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      mountedHotspotIdsRef.current = new Set();
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

  // Sync the editable hotspot list into Pannellum so the admin sees
  // markers right where they placed them — no need to switch to the
  // viewer to confirm a hotspot was actually saved.
  useEffect(() => {
    if (!ready) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const previous = mountedHotspotIdsRef.current;
    const current = new Set<string>();

    // Remove + re-add every hotspot. Simple and correct: an edit (same
    // id, new pitch/yaw/label) needs a fresh tooltip element anyway,
    // and the list is small enough that the work is negligible.
    previous.forEach((id) => {
      try {
        viewer.removeHotSpot(id);
      } catch {
        /* hotspot may already be gone — fine */
      }
    });

    (meta.hotspots ?? []).forEach((hs) => {
      try {
        viewer.addHotSpot(buildEditorHotspotConfig(hs, onSwitchToPanorama));
        current.add(hs.id);
      } catch (err) {
        // Don't let one bad hotspot break the rest.
        console.warn("Failed to add editor hotspot", hs.id, err);
      }
    });

    mountedHotspotIdsRef.current = current;
  }, [ready, meta.hotspots, onSwitchToPanorama]);

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
    setLastSavedSnapshot(JSON.stringify(cleaned));
    setSaving(false);
  }

  /** Drag-to-link drop on the 360° canvas: creates a forward nav
   *  hotspot at the drop location pointing at the dragged panorama,
   *  persists it, then asks the page to mirror a reverse hotspot
   *  into the target and switch the editor over.
   *
   *  We commit synchronously here (not deferred to Save Configuration)
   *  because the editor is about to unmount on switch — anything held
   *  in local `meta` state would be lost. */
  const handleLinkDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const targetId = e.dataTransfer.getData("application/x-pano-link");
      if (!targetId || targetId === sectionId) {
        setDraggingLinkTargetId(null);
        return;
      }
      const viewer = viewerRef.current;
      if (!viewer) {
        setDraggingLinkTargetId(null);
        return;
      }

      const targetSection = allSections.find((s) => s.id === targetId);
      if (!targetSection) {
        setDraggingLinkTargetId(null);
        return;
      }

      // Pannellum exposes mouseEventToCoords([pitch, yaw]) — drag events
      // carry the same clientX/Y so this works for drops as well.
      const coords = viewer.mouseEventToCoords(e.nativeEvent as MouseEvent);
      if (!coords) {
        setDraggingLinkTargetId(null);
        return;
      }
      const [pitch, yaw] = coords;

      setLinking(true);
      try {
        // 1. Forward hotspot — current pano → dropped pano, at drop coords.
        const forwardHotspot: import("@/types/panorama").NavigationHotspot = {
          id: crypto.randomUUID(),
          type: "navigation",
          pitch,
          yaw,
          label: panoramaLabel(targetSection),
          targetSectionId: targetId,
        };
        const nextMeta: PanoramaMetadata = {
          ...meta,
          hotspots: [...(meta.hotspots ?? []), forwardHotspot],
        };

        // Clean before save (same rules as handleSave).
        const cleaned: PanoramaMetadata = { ...nextMeta };
        if (!cleaned.roomLabel) delete cleaned.roomLabel;
        if (!cleaned.tourGroupId) delete cleaned.tourGroupId;
        if (!cleaned.floorPlan) delete cleaned.floorPlan;
        if (cleaned.hotspots?.length === 0) delete cleaned.hotspots;

        await onSave(cleaned);
        setMeta(nextMeta);
        setLastSavedSnapshot(JSON.stringify(cleaned));

        // 2. Reverse hotspot in target — page handles the cross-section PATCH.
        if (onLinkPanorama) {
          await onLinkPanorama({
            fromSectionId: sectionId,
            toSectionId: targetId,
            forwardPitch: pitch,
            forwardYaw: yaw,
          });
        }

        // 3. Switch editor to the freshly-linked room.
        if (onSwitchToPanorama) {
          onSwitchToPanorama(targetId);
        }
      } finally {
        setLinking(false);
        setDraggingLinkTargetId(null);
      }
    },
    [sectionId, allSections, meta, onSave, onLinkPanorama, onSwitchToPanorama]
  );

  function handleLinkDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes("application/x-pano-link")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "link";
    }
  }

  function handleRailDragStart(
    e: React.DragEvent<HTMLDivElement>,
    panoId: string
  ) {
    e.dataTransfer.setData("application/x-pano-link", panoId);
    e.dataTransfer.effectAllowed = "link";
    setDraggingLinkTargetId(panoId);
  }

  function handleRailDragEnd() {
    setDraggingLinkTargetId(null);
  }

  // True whenever local meta diverges from the last persisted snapshot —
  // drives the "Unsaved changes" pill so admins can't miss it.
  const dirty = JSON.stringify(meta) !== lastSavedSnapshot;

  const editingHotspot = editingHotspotId
    ? (meta.hotspots || []).find((h) => h.id === editingHotspotId) || null
    : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "hotspots", label: "Hotspots" },
    { key: "initial-view", label: "Initial View" },
    { key: "floor-plan", label: "Floor Plan" },
  ];

  return (
    <div className="border-t border-white/[0.06] bg-white/[0.02]">
      <div className="grid lg:grid-cols-2 gap-0">
        {/* Left: Pannellum preview */}
        <div
          className="relative"
          style={{ minHeight: 320 }}
          onDragOver={handleLinkDragOver}
          onDrop={handleLinkDrop}
        >
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

          {/* Drag-to-link indicator. Bright crosshair-style border +
              instruction chip so the admin knows the canvas is now a
              drop target for the panorama they grabbed. */}
          {draggingLinkTargetId && (
            <>
              <div className="pointer-events-none absolute inset-2 z-10 rounded-lg border-2 border-dashed border-emerald-400/70 animate-pulse" />
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs text-white backdrop-blur-sm shadow-lg">
                <Crosshair className="h-3.5 w-3.5" />
                Drop where the doorway to{" "}
                <span className="font-semibold">
                  {panoramaLabel(
                    allSections.find((s) => s.id === draggingLinkTargetId) ?? {
                      id: draggingLinkTargetId,
                      title: null,
                      type: "panorama",
                      order: 0,
                      metadata: null,
                      file: null,
                    }
                  )}
                </span>{" "}
                appears
              </div>
            </>
          )}

          {/* Linking in flight — block re-drops + show a spinner. */}
          {linking && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-lg bg-black/70 px-4 py-2 text-xs text-white">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Linking rooms…
              </div>
            </div>
          )}

          {/* Hotspot markers overlay */}
          {ready && (meta.hotspots || []).length > 0 && (
            <div className="absolute bottom-3 left-3 z-10 text-[10px] text-slate-400 bg-black/50 rounded px-2 py-1 backdrop-blur-sm">
              {(meta.hotspots || []).length} hotspot
              {(meta.hotspots || []).length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Drag-to-link rail. Sits along the bottom edge of the
              panorama; thumbnails of every *other* panorama in the
              deck — drag onto the 360° view to wire up a navigation
              hotspot in both directions at once. */}
          {panoramaSections.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[0.1] bg-black/55 backdrop-blur-md">
              <div className="px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 shrink-0">
                  Drag to link →
                </span>
                <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-thin">
                  {panoramaSections
                    .filter((s) => s.id !== sectionId)
                    .map((s) => {
                      const thumbFileId = s.fileId ?? null;
                      const isDragging = draggingLinkTargetId === s.id;
                      // Already-linked indicator: greens a thumbnail
                      // whose pano is already reachable from here via a
                      // navigation hotspot, so the admin doesn't drop
                      // a duplicate.
                      const alreadyLinked = (meta.hotspots ?? []).some(
                        (h) =>
                          h.type === "navigation" && h.targetSectionId === s.id
                      );
                      return (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={(e) => handleRailDragStart(e, s.id)}
                          onDragEnd={handleRailDragEnd}
                          title={
                            alreadyLinked
                              ? `Already linked to ${panoramaLabel(s)} — drag again to add another doorway`
                              : `Drag onto the 360° view to add a doorway to ${panoramaLabel(s)}`
                          }
                          className={`group shrink-0 rounded-md border overflow-hidden cursor-grab active:cursor-grabbing transition-all ${
                            isDragging
                              ? "border-emerald-500 opacity-50 scale-95"
                              : alreadyLinked
                                ? "border-emerald-500/40 hover:border-emerald-400/70"
                                : "border-white/[0.15] hover:border-brand-500/60"
                          }`}
                          style={{ width: 88 }}
                        >
                          <div className="relative w-full" style={{ height: 36 }}>
                            {thumbFileId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/files/${thumbFileId}/download?inline=true`}
                                alt=""
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                draggable={false}
                              />
                            ) : (
                              <div className="absolute inset-0 bg-white/[0.05]" />
                            )}
                            {alreadyLinked && (
                              <div className="absolute top-0.5 right-0.5 rounded-full bg-emerald-500 w-2 h-2 ring-1 ring-black/60" />
                            )}
                          </div>
                          <div className="px-1 py-0.5 text-[9px] text-slate-200 text-center truncate bg-black/40">
                            {panoramaLabel(s)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
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
                    onAddPanorama={onAddPanorama}
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
                    onAddPanorama={onAddPanorama}
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
                onAddFloorPlan={onAddFloorPlan}
                onCaptureNorth={() => {
                  // Pull the current yaw straight from the Pannellum
                  // viewer on the left. Round to one decimal — more
                  // precision than that is meaningless for a heading
                  // indicator and just clutters the metadata.
                  const viewer = viewerRef.current;
                  if (!viewer) return null;
                  return Math.round(viewer.getYaw() * 10) / 10;
                }}
              />
            )}

            {/* Tour Settings tab */}
          </div>

          {/* Save button — pulses + colour-shifts when there are local
             edits that haven't been persisted yet, so admins notice. */}
          <div
            className={`border-t border-white/[0.06] px-4 py-3 transition-colors ${
              dirty ? "bg-amber-500/[0.05]" : ""
            }`}
          >
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                dirty
                  ? "bg-amber-500 hover:bg-amber-600 ring-2 ring-amber-400/40 animate-pulse"
                  : "bg-brand-600 hover:bg-brand-700"
              }`}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {dirty ? "Save Configuration (unsaved changes)" : "Save Configuration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
