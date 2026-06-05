"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  PanoramaMetadata,
  PanoramaHotspot,
  TourRoom,
} from "@/types/panorama";
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
  /** Tour rooms defined on the presentation. The per-pano floor
   *  plan tab uses these to populate the room dropdown. */
  rooms: TourRoom[];
  /** Patch a single tour room (e.g. when toggling the starting-pano
   *  for the currently-edited panorama). Parent persists. */
  onRoomChange: (id: string, patch: Partial<TourRoom>) => void;
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
  onSelectHotspot?: (id: string) => void,
  /** Admin-only display label. For nav hotspots we pass the TARGET
   *  pano's image name so the admin can tell which pano a link goes
   *  to (the stored hs.label is the room name, shown to clients).
   *  Falls back to hs.label when not provided. */
  displayLabel?: string
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
      // ZERO-SIZE anchor. Pannellum centers the hotspot element on the
      // (pitch,yaw) point using the element's own size — so a normal
      // block (circle + label) gets its *block center* placed on the
      // point, landing the visible dot above/left of where you
      // clicked. A 0×0 wrapper has no size to offset, so its origin
      // sits exactly on the point; the dot is then centered on that
      // origin with its own translate(-50%,-50%), and the label is
      // absolutely positioned below (out of flow, so it can't shift
      // the anchor). Net: the dot lands precisely where you clicked.
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
        position: relative;
        width: 0;
        height: 0;
        pointer-events: ${onSelectHotspot ? "auto" : "none"};
        cursor: ${onSelectHotspot ? "pointer" : "default"};
      `;
      wrapper.title = onSelectHotspot
        ? "Click to edit this hotspot"
        : hs.label;

      const dot = document.createElement("div");
      dot.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        transform: translate(-50%, -50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid white;
        background: ${isNav ? "rgba(59,130,246,0.9)" : "rgba(245,158,11,0.9)"};
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 13px;
        font-weight: 700;
        line-height: 1;
      `;
      dot.textContent = isNav ? "↗" : "i";

      const label = document.createElement("span");
      label.style.cssText = `
        position: absolute;
        left: 0;
        top: 20px;
        transform: translateX(-50%);
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
      `;
      label.textContent = displayLabel ?? hs.label;

      wrapper.appendChild(dot);
      wrapper.appendChild(label);

      if (onSelectHotspot) {
        wrapper.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectHotspot(hs.id);
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

/** Canonical persisted shape for a panorama's metadata. Strips empty
 *  / undefined fields so (a) what we save is tidy and (b) the dirty
 *  check compares apples to apples — meta carries empty-string
 *  defaults for some fields that we never persist, which otherwise
 *  left the Save button permanently "unsaved". */
function cleanMeta(m: PanoramaMetadata): PanoramaMetadata {
  const c: PanoramaMetadata = { ...m };
  if (!c.roomLabel) delete c.roomLabel;
  if (!c.tourGroupId) delete c.tourGroupId;
  if (!c.floorPlan) delete c.floorPlan;
  if (!c.roomId) delete c.roomId;
  if (c.northYaw === undefined || c.northYaw === null) delete c.northYaw;
  if (!c.hotspots || c.hotspots.length === 0) delete c.hotspots;
  return c;
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

/** DISTINCT label for the link rail — prefers the backing FILE name,
 *  because two panos can share a room name (e.g. both "Lobby") and
 *  the admin needs to tell them apart to connect the right ones.
 *  Falls back to the title, then a short id. */
function panoFileLabel(s: SectionOption): string {
  const fromFile = s.file?.originalName?.replace(/\.[^.]+$/, "");
  if (fromFile) return fromFile;
  if (s.title?.trim()) return s.title.trim();
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
  rooms,
  onRoomChange,
  onLinkPanorama,
  onSwitchToPanorama,
}: PanoramaEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  /** IDs of hotspots currently mounted in the Pannellum viewer, so the
   *  sync effect knows what to remove on the next pass. */
  const mountedHotspotIdsRef = useRef<Set<string>>(new Set());
  /** Holds the latest commitLink so the click-to-place effect (defined
   *  before commitLink) can call it without a TDZ/ordering problem. */
  const commitLinkRef = useRef<
    ((targetId: string, pitch: number, yaw: number) => void) | null
  >(null);
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("hotspots");
  const [saving, setSaving] = useState(false);
  // Local editable metadata. IMPORTANT: carry through roomId +
  // northYaw — omitting them here meant the Floor Plan tab's room
  // assignment never loaded (always showed "not in a room") and,
  // worse, hitting Save wrote metadata without roomId, wiping the
  // assignment.
  const [meta, setMeta] = useState<PanoramaMetadata>({
    initialView: initialMetadata.initialView || { pitch: 0, yaw: 180 },
    hotspots: initialMetadata.hotspots || [],
    floorPlan: initialMetadata.floorPlan || undefined,
    roomId: initialMetadata.roomId,
    northYaw: initialMetadata.northYaw,
    roomLabel: initialMetadata.roomLabel || "",
    tourGroupId: initialMetadata.tourGroupId || "",
  });

  /** Snapshot of the last persisted metadata so we can tell when there
   *  are unsaved local edits and prompt the admin to hit Save. Compared
   *  against cleanMeta(meta) so empty-string defaults don't leave the
   *  Save button stuck in a permanent "unsaved" state. */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(() =>
    JSON.stringify(cleanMeta(initialMetadata))
  );

  // Hotspot editing state
  const [placingHotspot, setPlacingHotspot] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{
    pitch: number;
    yaw: number;
  } | null>(null);
  const [editingHotspotId, setEditingHotspotId] = useState<string | null>(null);
  /** When set, the next click on the panorama re-positions THIS
   *  hotspot (move it) rather than placing a brand-new one. */
  const [repositioningHotspotId, setRepositioningHotspotId] = useState<
    string | null
  >(null);
  /** When set (via clicking a rail thumbnail), the next click on the
   *  panorama places a navigation link toward this target pano —
   *  precise placement instead of dropping at the view center. */
  const [linkingTargetId, setLinkingTargetId] = useState<string | null>(null);

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

  /** Clicking a marker on the panorama selects that hotspot for
   *  editing — opens the Hotspots tab + its edit form (Update /
   *  Move / Delete). Stable so the Pannellum effects can reference
   *  it without re-binding. */
  const handleSelectHotspot = useCallback((id: string) => {
    setActiveTab("hotspots");
    setPendingCoords(null);
    setPlacingHotspot(false);
    setRepositioningHotspotId(null);
    setEditingHotspotId(id);
  }, []);

  /** Admin-only marker label. For nav hotspots, show the TARGET
   *  pano's image name (so two "Lobby" rooms are distinguishable
   *  while wiring); the stored hs.label stays the room name for
   *  clients. Info hotspots keep their own label. */
  const editorLabelFor = useCallback(
    (hs: PanoramaHotspot): string | undefined => {
      if (hs.type === "navigation") {
        const target = allSections.find((s) => s.id === hs.targetSectionId);
        if (target) return panoFileLabel(target);
      }
      return undefined;
    },
    [allSections]
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

      // IMPORTANT: do NOT seed hotspots via the initial config.
      // Hotspots are managed solely by the sync effect (addHotSpot /
      // removeHotSpot, keyed by id). Adding them here too created a
      // second copy per hotspot — Pannellum then held a config-copy
      // AND an addHotSpot-copy, so deleting/moving one left the other
      // behind as a ghost. Single source of truth = no ghosts. The
      // sync effect fires the instant `ready` flips (on load), so
      // there's no visible delay.
      mountedHotspotIdsRef.current = new Set();

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
        hotSpots: [],
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

  // Handle click-to-place (new), click-to-reposition (existing), or
  // click-to-place-a-link (precise doorway toward a rail target).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    if (!placingHotspot && !repositioningHotspotId && !linkingTargetId) return;

    function handleClick(e: MouseEvent) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const coords = viewer.mouseEventToCoords(e);
      if (!coords) return;
      const [pitch, yaw] = coords;

      if (linkingTargetId) {
        // Place the navigation link exactly where the admin clicked,
        // toward the rail pano they picked. commitLink persists +
        // mirrors the reverse hotspot + switches editor.
        const target = linkingTargetId;
        setLinkingTargetId(null);
        commitLinkRef.current?.(target, pitch, yaw);
        return;
      }

      if (repositioningHotspotId) {
        // Move the existing hotspot to the clicked pitch/yaw, keeping
        // everything else (label, target, type). Re-open its editor.
        const id = repositioningHotspotId;
        setMeta((prev) => ({
          ...prev,
          hotspots: (prev.hotspots || []).map((h) =>
            h.id === id ? { ...h, pitch, yaw } : h
          ),
        }));
        setRepositioningHotspotId(null);
        setEditingHotspotId(id);
        return;
      }

      // Placing a brand-new hotspot.
      setPendingCoords({ pitch, yaw });
      setPlacingHotspot(false);
    }

    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [ready, placingHotspot, repositioningHotspotId, linkingTargetId]);

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
        viewer.addHotSpot(
          buildEditorHotspotConfig(hs, handleSelectHotspot, editorLabelFor(hs))
        );
        current.add(hs.id);
      } catch (err) {
        // Don't let one bad hotspot break the rest.
        console.warn("Failed to add editor hotspot", hs.id, err);
      }
    });

    mountedHotspotIdsRef.current = current;
  }, [ready, meta.hotspots, handleSelectHotspot, editorLabelFor]);

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
    try {
      const cleaned = cleanMeta(meta);
      await onSave(cleaned);
      // Snapshot the SAME shape we compare against in `dirty`, so the
      // button reliably returns to its resting state after a save.
      setLastSavedSnapshot(JSON.stringify(cleaned));
    } catch (err) {
      console.error("Save configuration failed", err);
    } finally {
      // Always clear the spinner — a thrown onSave used to leave the
      // button stuck spinning ("prompt doesn't go away").
      setSaving(false);
    }
  }

  /** Drag-to-link drop on the 360° canvas: creates a forward nav
   *  hotspot at the drop location pointing at the dragged panorama,
   *  persists it, then asks the page to mirror a reverse hotspot
   *  into the target and switch the editor over.
   *
   *  We commit synchronously here (not deferred to Save Configuration)
   *  because the editor is about to unmount on switch — anything held
   *  in local `meta` state would be lost. */
  /** Shared link logic — used by both the drag-drop and the
   *  click-to-link fallback. Creates a forward nav hotspot toward
   *  `targetId` at the given pitch/yaw, persists it, mirrors a
   *  reverse hotspot into the target, then switches the editor over. */
  const commitLink = useCallback(
    async (targetId: string, pitch: number, yaw: number) => {
      if (!targetId || targetId === sectionId) return;
      const targetSection = allSections.find((s) => s.id === targetId);
      if (!targetSection) return;

      setLinking(true);
      try {
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

        const cleaned = cleanMeta(nextMeta);
        await onSave(cleaned);
        setMeta(nextMeta);
        setLastSavedSnapshot(JSON.stringify(cleaned));

        if (onLinkPanorama) {
          await onLinkPanorama({
            fromSectionId: sectionId,
            toSectionId: targetId,
            forwardPitch: pitch,
            forwardYaw: yaw,
          });
        }
        if (onSwitchToPanorama) {
          onSwitchToPanorama(targetId);
        }
      } catch (err) {
        console.error("Link panorama failed", err);
      } finally {
        setLinking(false);
        setDraggingLinkTargetId(null);
      }
    },
    [sectionId, allSections, meta, onSave, onLinkPanorama, onSwitchToPanorama]
  );
  // Keep the ref current so the click-to-place effect can call it.
  commitLinkRef.current = commitLink;

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
      // Pannellum exposes mouseEventToCoords([pitch, yaw]) — drag events
      // carry the same clientX/Y so this works for drops as well.
      const coords = viewer.mouseEventToCoords(e.nativeEvent as MouseEvent);
      if (!coords) {
        setDraggingLinkTargetId(null);
        return;
      }
      await commitLink(targetId, coords[0], coords[1]);
    },
    [sectionId, commitLink]
  );

  /** Click a rail thumbnail → arm precise placement: the next click
   *  on the panorama drops the doorway exactly there and links. More
   *  reliable than HTML5 drag (which silently no-ops on some setups)
   *  and lets the admin pinpoint the spot rather than dropping at the
   *  view center. */
  const handleRailClick = useCallback((targetId: string) => {
    setPlacingHotspot(false);
    setPendingCoords(null);
    setEditingHotspotId(null);
    setRepositioningHotspotId(null);
    setLinkingTargetId(targetId);
  }, []);

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
  const dirty = JSON.stringify(cleanMeta(meta)) !== lastSavedSnapshot;

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

          {/* Placement / reposition / link-placement indicator */}
          {(placingHotspot || repositioningHotspotId || linkingTargetId) && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-brand-600/90 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <Crosshair className="h-3.5 w-3.5" />
              {linkingTargetId
                ? `Click where the doorway to ${panoramaLabel(
                    allSections.find((s) => s.id === linkingTargetId) ?? {
                      id: linkingTargetId,
                      title: null,
                      type: "panorama",
                      order: 0,
                      metadata: null,
                      file: null,
                    }
                  )} should go`
                : repositioningHotspotId
                  ? "Click to move the hotspot"
                  : "Click to place hotspot"}
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
                  Click or drag to link →
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
                          onClick={() => handleRailClick(s.id)}
                          title={
                            alreadyLinked
                              ? `Already linked to ${panoFileLabel(s)} — click or drag to add another doorway`
                              : `Click to link, or drag onto the 360° view to place a doorway to ${panoFileLabel(s)}`
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
                            {panoFileLabel(s)}
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
                {/* Repositioning prompt — replaces the form while the
                    admin picks a new spot on the panorama. */}
                {repositioningHotspotId && (
                  <div className="rounded-lg border border-brand-500/40 bg-brand-500/[0.06] p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-brand-200">
                      <Crosshair className="h-3.5 w-3.5" />
                      Click on the panorama to move this hotspot
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const id = repositioningHotspotId;
                        setRepositioningHotspotId(null);
                        setEditingHotspotId(id);
                      }}
                      className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Cancel move
                    </button>
                  </div>
                )}

                {/* Show form when placing or editing */}
                {!repositioningHotspotId && pendingCoords && (
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

                {!repositioningHotspotId && editingHotspot && (
                  <PanoramaHotspotForm
                    hotspot={editingHotspot}
                    pitch={editingHotspot.pitch}
                    yaw={editingHotspot.yaw}
                    panoramaSections={panoramaSections}
                    projectFiles={projectFiles}
                    onSave={handleSaveHotspot}
                    onCancel={() => setEditingHotspotId(null)}
                    onDelete={() => handleDeleteHotspot(editingHotspot.id)}
                    onReposition={() => {
                      // Close the form, arm reposition mode — next
                      // panorama click moves this hotspot.
                      setEditingHotspotId(null);
                      setRepositioningHotspotId(editingHotspot.id);
                    }}
                    onAddPanorama={onAddPanorama}
                  />
                )}

                {/* Add hotspot button */}
                {!repositioningHotspotId && !pendingCoords && !editingHotspotId && (
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

            {/* Floor Plan tab — now a room dropdown + starting toggle.
                The actual marker position lives on the room (managed
                in the top-level Floor Plan map), not on the
                panorama. */}
            {activeTab === "floor-plan" && (
              <PanoramaFloorPlanEditor
                sectionId={sectionId}
                metadata={meta}
                onMetadataChange={(patch) =>
                  setMeta((prev) => ({ ...prev, ...patch }))
                }
                rooms={rooms}
                onRoomChange={onRoomChange}
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
