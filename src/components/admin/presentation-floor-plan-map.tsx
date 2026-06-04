"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PanoramaMetadata } from "@/types/panorama";
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  X,
} from "lucide-react";

/** Minimal shape of a section we care about — keeps this component
 *  decoupled from the bigger SectionRow in the presentation page. */
export interface FloorPlanMapSection {
  id: string;
  type: string;
  title: string | null;
  fileId: string | null;
  metadata: Record<string, unknown> | null;
  file: { id: string; originalName: string } | null;
}

interface FileOption {
  id: string;
  originalName: string;
  mimeType: string;
}

interface PresentationFloorPlanMapProps {
  sections: FloorPlanMapSection[];
  projectFiles: FileOption[];
  /** Persist a panorama's full metadata back to the server. The map
   *  composes the new metadata (preserving hotspots, initialView, etc.)
   *  and hands it over — the page just forwards to its PATCH endpoint. */
  onUpdateSectionMetadata: (
    sectionId: string,
    metadata: PanoramaMetadata
  ) => Promise<void>;
  /** Promise-based picker for adding a new floor plan image. Resolves
   *  with a project fileId, or null if the picker was dismissed. */
  onPickFloorPlan: () => Promise<string | null>;
}

/** Pull the typed floor plan blob off a section's metadata, if any. */
function getFloorPlan(
  section: FloorPlanMapSection
): PanoramaMetadata["floorPlan"] | undefined {
  const meta = section.metadata as PanoramaMetadata | null;
  return meta?.floorPlan;
}

/** Friendly label for a panorama section: prefers an explicit Room
 *  Label, then the section title, then the filename (without ext),
 *  then a short id. Keeps the rail from showing "Panorama cmpy0j". */
function panoramaLabel(section: FloorPlanMapSection): string {
  const meta = section.metadata as PanoramaMetadata | null;
  const roomLabel = meta?.roomLabel?.trim();
  if (roomLabel) return roomLabel;
  if (section.title?.trim()) return section.title.trim();
  const fromFile = section.file?.originalName?.replace(/\.[^.]+$/, "");
  if (fromFile) return fromFile;
  return `Panorama ${section.id.slice(0, 6)}`;
}

export function PresentationFloorPlanMap({
  sections,
  projectFiles,
  onUpdateSectionMetadata,
  onPickFloorPlan,
}: PresentationFloorPlanMapProps) {
  /** Panoramas in the presentation, in stable order — these are what
   *  the admin drags onto the floor plan. Non-panorama sections (image,
   *  video, divider, etc.) are ignored: this view is exclusively about
   *  spatial wayfinding for 360° rooms. */
  const panoramas = useMemo(
    () =>
      sections.filter(
        (s): s is FloorPlanMapSection & { fileId: string } =>
          s.type === "panorama" && !!s.fileId
      ),
    [sections]
  );

  /** Every floor plan image currently referenced by at least one
   *  panorama. We surface these as quick-pick chips so admins juggling a
   *  multi-floor building can flip between Floor 1 / Floor 2 without
   *  re-opening the picker. */
  const usedFloorPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of panoramas) {
      const fp = getFloorPlan(p);
      if (fp?.imageFileId) set.add(fp.imageFileId);
    }
    return Array.from(set);
  }, [panoramas]);

  /** Active floor plan image — the one rendered in the drop target.
   *  Defaults to the first one referenced by any panorama; falls back
   *  to "no plan yet" until the admin picks one. State, not derived,
   *  so the admin can flip floors without losing their place. */
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(
    () => usedFloorPlanIds[0] ?? null
  );

  /** Keep activeFloorPlanId valid if the source data shifts (e.g. the
   *  only floor plan in use got removed by clearing every marker). */
  const activeIsStillValid =
    activeFloorPlanId !== null && usedFloorPlanIds.includes(activeFloorPlanId);
  const effectiveActive = activeIsStillValid
    ? activeFloorPlanId
    : usedFloorPlanIds[0] ?? activeFloorPlanId; // tolerate "newly picked, not yet placed"

  const [collapsed, setCollapsed] = useState(false);
  const [pickingPlan, setPickingPlan] = useState(false);
  /** Mid-drag transient state: the section the admin is currently
   *  hauling onto (or around) the floor plan, so the cursor target
   *  reads as "dropping Lobby". Cleared on dragEnd / drop. */
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null
  );
  /** Per-pano "saving" indicator so the marker pulses while the PATCH
   *  is in flight — avoids confusion if the admin's network is slow
   *  and they're tempted to click again. */
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const dropRef = useRef<HTMLDivElement>(null);

  /** Drag-source handler on a thumbnail. We stash the section id in
   *  dataTransfer so the same handler can later be re-used to drop
   *  onto a sibling target (e.g. trash icon, if we add one). */
  function handleDragStart(e: React.DragEvent, sectionId: string) {
    e.dataTransfer.setData("application/x-pano-section-id", sectionId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingSectionId(sectionId);
  }

  function handleDragEnd() {
    setDraggingSectionId(null);
  }

  /** Resolve a drop event into normalized [0..1] coordinates on the
   *  floor plan. Returns null if we somehow can't measure the target
   *  (shouldn't happen unless the ref is stale). */
  function getDropCoords(e: React.DragEvent | React.MouseEvent) {
    const target = dropRef.current;
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, Math.round(x * 1000) / 1000)),
      y: Math.max(0, Math.min(1, Math.round(y * 1000) / 1000)),
    };
  }

  /** Single source of truth for placing/moving a panorama on the floor
   *  plan. Composes the new metadata from the section's existing
   *  metadata (so we don't blow away hotspots / initialView / etc.) and
   *  fires the PATCH via the parent. */
  const placePanoramaAt = useCallback(
    async (sectionId: string, x: number, y: number) => {
      if (!effectiveActive) return;
      const section = panoramas.find((p) => p.id === sectionId);
      if (!section) return;
      const existingMeta = (section.metadata as PanoramaMetadata) || {};
      const nextMeta: PanoramaMetadata = {
        ...existingMeta,
        floorPlan: {
          imageFileId: effectiveActive,
          markerX: x,
          markerY: y,
        },
      };
      setSavingIds((prev) => new Set(prev).add(sectionId));
      try {
        await onUpdateSectionMetadata(sectionId, nextMeta);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }
    },
    [effectiveActive, panoramas, onUpdateSectionMetadata]
  );

  /** Remove a panorama from the floor plan entirely. Wipes only the
   *  floorPlan field — hotspots and the rest stick around. */
  const clearPanorama = useCallback(
    async (sectionId: string) => {
      const section = panoramas.find((p) => p.id === sectionId);
      if (!section) return;
      const existingMeta = (section.metadata as PanoramaMetadata) || {};
      // Destructure to strip floorPlan without mutating the source.
      const { floorPlan: _ignored, ...rest } = existingMeta;
      void _ignored;
      setSavingIds((prev) => new Set(prev).add(sectionId));
      try {
        await onUpdateSectionMetadata(sectionId, rest);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(sectionId);
          return next;
        });
      }
    },
    [panoramas, onUpdateSectionMetadata]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const sectionId = e.dataTransfer.getData("application/x-pano-section-id");
    if (!sectionId) return;
    const coords = getDropCoords(e);
    if (!coords) return;
    placePanoramaAt(sectionId, coords.x, coords.y);
    setDraggingSectionId(null);
  }

  function handleDragOver(e: React.DragEvent) {
    // Only show the drop indicator for our payload — don't intercept
    // unrelated drags (e.g. external image dragged from the desktop,
    // which we don't currently support here).
    if (
      e.dataTransfer.types.includes("application/x-pano-section-id") &&
      effectiveActive
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  async function handlePickFloorPlan() {
    if (pickingPlan) return;
    setPickingPlan(true);
    try {
      const id = await onPickFloorPlan();
      if (id) {
        setActiveFloorPlanId(id);
      }
    } finally {
      setPickingPlan(false);
    }
  }

  // Panoramas split by whether they're on the active plan, on a
  // different plan, or not placed anywhere. Drives the badge in the
  // rail and what shows up as a marker.
  const placedOnActive = panoramas.filter(
    (p) => getFloorPlan(p)?.imageFileId === effectiveActive
  );
  const placedElsewhere = panoramas.filter((p) => {
    const fp = getFloorPlan(p);
    return fp?.imageFileId && fp.imageFileId !== effectiveActive;
  });
  const unplaced = panoramas.filter((p) => !getFloorPlan(p)?.imageFileId);

  const activeFile = effectiveActive
    ? projectFiles.find((f) => f.id === effectiveActive)
    : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-6 py-4 border-b border-white/[0.06] flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
          <h2 className="text-sm font-medium text-slate-100">Floor Plan</h2>
          {panoramas.length > 0 && (
            <span className="text-xs text-slate-500">
              · {placedOnActive.length}/{panoramas.length} placed
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Drag panoramas onto the plan
        </span>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Plan picker row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {usedFloorPlanIds.length > 0 &&
              usedFloorPlanIds.map((id) => {
                const f = projectFiles.find((pf) => pf.id === id);
                const isActive = id === effectiveActive;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveFloorPlanId(id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                        : "border-white/[0.1] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                    }`}
                    title={f?.originalName || "Floor plan"}
                  >
                    <ImageIcon className="h-3 w-3" />
                    <span className="max-w-[160px] truncate">
                      {f?.originalName?.replace(/\.[^.]+$/, "") || "Plan"}
                    </span>
                  </button>
                );
              })}
            <button
              type="button"
              onClick={handlePickFloorPlan}
              disabled={pickingPlan}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/[0.15] px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:border-white/[0.3] disabled:opacity-50 transition-colors"
            >
              {pickingPlan ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {usedFloorPlanIds.length === 0 ? "Add floor plan" : "Another plan"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[200px_1fr]">
            {/* Left rail: panorama thumbnails */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Panoramas
              </p>
              {panoramas.length === 0 && (
                <p className="text-[11px] text-slate-500 italic">
                  No 360° panoramas in this presentation yet.
                </p>
              )}

              {/* Render in an order that mirrors the drop target — placed
                  on this plan first, placed elsewhere next, then
                  unplaced — so it reads at a glance. */}
              {[...placedOnActive, ...unplaced, ...placedElsewhere].map((p) => {
                const fp = getFloorPlan(p);
                const placedHere = fp?.imageFileId === effectiveActive;
                const placedThere =
                  !!fp?.imageFileId && fp.imageFileId !== effectiveActive;
                const otherPlanFile = placedThere
                  ? projectFiles.find((pf) => pf.id === fp!.imageFileId)
                  : null;
                const isDragging = draggingSectionId === p.id;
                const isSaving = savingIds.has(p.id);

                return (
                  <div
                    key={p.id}
                    draggable={!!effectiveActive}
                    onDragStart={(e) => handleDragStart(e, p.id)}
                    onDragEnd={handleDragEnd}
                    title={
                      !effectiveActive
                        ? "Pick a floor plan first"
                        : placedHere
                          ? "Drag to reposition on this plan"
                          : "Drag onto the floor plan to place"
                    }
                    className={`group flex items-center gap-2 rounded-lg border p-1.5 transition-all ${
                      isDragging
                        ? "border-brand-500 bg-brand-500/10 opacity-50"
                        : placedHere
                          ? "border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1]"
                          : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
                    } ${effectiveActive ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"}`}
                  >
                    {/* Thumbnail */}
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded border border-white/[0.06] bg-white/[0.04]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/files/${p.fileId}/download?inline=true`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover pointer-events-none"
                        draggable={false}
                      />
                      {isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Loader2 className="h-3 w-3 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    {/* Label + status */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-slate-200 truncate">
                        {panoramaLabel(p)}
                      </div>
                      <div className="text-[9px] text-slate-500 flex items-center gap-1">
                        {placedHere ? (
                          <>
                            <MapPin className="h-2.5 w-2.5 text-emerald-400" />
                            On this plan
                          </>
                        ) : placedThere ? (
                          <>
                            <MapPin className="h-2.5 w-2.5 text-amber-400" />
                            <span className="truncate">
                              On{" "}
                              {otherPlanFile?.originalName?.replace(
                                /\.[^.]+$/,
                                ""
                              ) || "another plan"}
                            </span>
                          </>
                        ) : (
                          "Not placed"
                        )}
                      </div>
                    </div>

                    {placedHere && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearPanorama(p.id);
                        }}
                        title="Remove from floor plan"
                        className="shrink-0 rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: drop target */}
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`relative rounded-lg border-2 border-dashed overflow-hidden transition-colors ${
                draggingSectionId
                  ? "border-brand-500/60 bg-brand-500/[0.05]"
                  : "border-white/[0.08] bg-black/20"
              }`}
              style={{ minHeight: 320 }}
            >
              {effectiveActive ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${effectiveActive}/download?inline=true`}
                    alt={activeFile?.originalName || "Floor plan"}
                    className="w-full h-auto block select-none"
                    draggable={false}
                  />
                  {/* Markers — one per panorama placed on this plan */}
                  {placedOnActive.map((p) => {
                    const fp = getFloorPlan(p)!;
                    return (
                      <Marker
                        key={p.id}
                        sectionId={p.id}
                        label={panoramaLabel(p)}
                        x={fp.markerX}
                        y={fp.markerY}
                        northYaw={fp.northYaw}
                        saving={savingIds.has(p.id)}
                        dragging={draggingSectionId === p.id}
                        onDragStart={(e) => handleDragStart(e, p.id)}
                        onDragEnd={handleDragEnd}
                        onRemove={() => clearPanorama(p.id)}
                      />
                    );
                  })}
                  {placedOnActive.length === 0 && (
                    <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
                      <div className="mb-4 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 text-[10px] text-slate-300 uppercase tracking-wider">
                        Drag a panorama here to place it
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <ImageIcon className="h-6 w-6" />
                  <p className="text-xs">No floor plan yet</p>
                  <button
                    type="button"
                    onClick={handlePickFloorPlan}
                    disabled={pickingPlan}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05] transition-colors disabled:opacity-50"
                  >
                    {pickingPlan ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Pick a floor plan image
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Marker — rendered absolutely-positioned over the floor plan image. */
/*  Itself draggable so admins can nudge a placement without having    */
/*  to clear-and-re-drop from the rail.                                */
/* ────────────────────────────────────────────────────────────────── */

interface MarkerProps {
  sectionId: string;
  label: string;
  x: number;
  y: number;
  /** Optional calibrated "north" yaw — if set, we render a small
   *  heading-up arrow on top of the dot pointing in the direction
   *  that reads as UP on the floor plan. Lets admins visually
   *  confirm the calibration without bouncing to the viewer. */
  northYaw?: number;
  saving: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRemove: () => void;
}

/** Marker style matches the client-viewer minimap and the per-
 *  panorama floor plan editor — blue (#3b82f6) dot, white ring,
 *  with the calibrated heading arrow when northYaw is set. The
 *  three contexts now look identical at a glance:
 *    1. Admin's main floor-plan map (this component)
 *    2. Per-panorama Floor Plan tab in the panorama editor
 *    3. Client viewer's minimap during walkthrough
 *  No more "why does this room look different here vs. there?" */
function Marker({
  label,
  x,
  y,
  northYaw,
  saving,
  dragging,
  onDragStart,
  onDragEnd,
  onRemove,
}: MarkerProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group absolute z-10 cursor-grab active:cursor-grabbing"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: "translate(-50%, -100%)",
        opacity: dragging ? 0.4 : 1,
        transition: "opacity 150ms ease",
      }}
    >
      <div className="flex flex-col items-center -mb-1">
        <div
          className="rounded-md bg-black/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white whitespace-nowrap shadow-lg select-none"
          style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {label}
        </div>
        <div className="relative">
          <div
            className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
            style={{
              background: "#3b82f6",
              boxShadow:
                "0 0 0 2px rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.5)",
            }}
          />
          {/* Calibrated heading arrow — points UP relative to the
              dot, marking the direction the admin chose as "north"
              for this panorama. Same indicator the viewer's minimap
              shows live, just static here since there's no live
              panorama session to tie it to. */}
          {northYaw !== undefined && !saving && (
            <div
              className="pointer-events-none absolute"
              style={{
                top: "50%",
                left: "50%",
                width: 18,
                height: 18,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderBottom: "5px solid rgba(59,130,246,0.95)",
                }}
              />
            </div>
          )}
          {saving && (
            <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
          )}
        </div>
        {/* tiny stem pointing to the exact spot */}
        <div
          className="w-0.5 bg-white/70"
          style={{ height: 6, marginTop: -1 }}
        />
      </div>

      {/* Remove button — appears on hover, doesn't initiate drag because
          we stopPropagation on its mousedown/dragstart. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => {
          // Don't let dragging the X also initiate a marker drag.
          e.preventDefault();
          e.stopPropagation();
        }}
        title="Remove from floor plan"
        className="absolute -top-1 -right-3 rounded-full bg-black/80 p-0.5 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
