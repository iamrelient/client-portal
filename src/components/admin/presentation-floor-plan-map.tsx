"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanoramaMetadata, TourRoom } from "@/types/panorama";
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";

/** Minimal shape of a presentation section the map cares about. */
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
  rooms: TourRoom[];
  sections: FloorPlanMapSection[];
  projectFiles: FileOption[];
  /** Replace the entire rooms list. Caller persists. */
  onRoomsChange: (next: TourRoom[]) => void;
  /** Promise-based file picker for adding a new floor plan image. */
  onPickFloorPlan: () => Promise<string | null>;
}

/** Friendly label for a panorama — for the starting-pano dropdown. */
function panoramaLabel(s: FloorPlanMapSection, idx: number): string {
  const meta = (s.metadata || {}) as PanoramaMetadata;
  if (meta.roomLabel?.trim()) return meta.roomLabel.trim();
  if (s.title?.trim()) return s.title.trim();
  const fromFile = s.file?.originalName?.replace(/\.[^.]+$/, "");
  if (fromFile) return fromFile;
  return `Panorama ${idx + 1}`;
}

export function PresentationFloorPlanMap({
  rooms,
  sections,
  projectFiles,
  onRoomsChange,
  onPickFloorPlan,
}: PresentationFloorPlanMapProps) {
  /** Every panorama section in the presentation — used to populate
   *  the "starting pano" dropdown on each room. */
  const panoramas = useMemo(
    () =>
      sections.filter(
        (s): s is FloorPlanMapSection & { fileId: string } =>
          s.type === "panorama" && !!s.fileId
      ),
    [sections]
  );

  /** Every floor plan image referenced by at least one room. Used as
   *  the quick-pick chip row above the canvas for multi-floor decks. */
  const usedFloorPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) set.add(r.floorPlanImageFileId);
    return Array.from(set);
  }, [rooms]);

  /** Active plan being edited. Defaults to the first used plan, or
   *  null when there are no rooms yet (will get set once a plan is
   *  picked via the add-room flow). */
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(
    () => usedFloorPlanIds[0] ?? null
  );

  // Keep activeFloorPlanId valid if the underlying list shifts.
  useEffect(() => {
    if (activeFloorPlanId && !usedFloorPlanIds.includes(activeFloorPlanId)) {
      setActiveFloorPlanId(usedFloorPlanIds[0] ?? null);
    }
  }, [activeFloorPlanId, usedFloorPlanIds]);

  const [collapsed, setCollapsed] = useState(false);
  const [pickingPlan, setPickingPlan] = useState(false);
  /** "Add room" mode — next click on the floor plan creates a new
   *  room at that position. Cleared after one drop or on cancel. */
  const [addingRoomMode, setAddingRoomMode] = useState(false);
  /** Currently selected room id — drives the inline edit panel
   *  below the canvas (name, starting pano, delete). */
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  /** Mid-drag transient. */
  const [draggingRoomId, setDraggingRoomId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  /** Rooms anchored to the active floor plan only — the canvas only
   *  renders these. Rooms on other floors stay in `rooms` but are
   *  out of view until the admin switches to their plan. */
  const activeRooms = useMemo(
    () => rooms.filter((r) => r.floorPlanImageFileId === activeFloorPlanId),
    [rooms, activeFloorPlanId]
  );

  /** Translate a pointer event on the canvas to normalized 0-1 floor
   *  plan coordinates. */
  function getNormalizedCoords(
    e: React.MouseEvent | React.PointerEvent
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, Math.round(x * 1000) / 1000)),
      y: Math.max(0, Math.min(1, Math.round(y * 1000) / 1000)),
    };
  }

  /** Canvas click — only meaningful in "add room" mode. Creates a
   *  new room at the click coordinates and selects it for editing. */
  function handleCanvasClick(e: React.MouseEvent) {
    if (!addingRoomMode || !activeFloorPlanId) return;
    const coords = getNormalizedCoords(e);
    if (!coords) return;
    const newRoom: TourRoom = {
      id: `room_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      name: `Room ${rooms.length + 1}`,
      floorPlanImageFileId: activeFloorPlanId,
      markerX: coords.x,
      markerY: coords.y,
      startingPanoSectionId: null,
    };
    onRoomsChange([...rooms, newRoom]);
    setSelectedRoomId(newRoom.id);
    setAddingRoomMode(false);
  }

  /** Drag a room marker to reposition it. Uses pointer events so
   *  touch works the same as mouse. */
  function handleRoomPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    room: TourRoom
  ) {
    e.stopPropagation();
    if (addingRoomMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragOffsetRef.current = {
      dx: e.clientX - (rect.left + room.markerX * rect.width),
      dy: e.clientY - (rect.top + room.markerY * rect.height),
    };
    setDraggingRoomId(room.id);
    setSelectedRoomId(room.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleRoomPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRoomId || !dragOffsetRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x =
      (e.clientX - dragOffsetRef.current.dx - rect.left) / rect.width;
    const y =
      (e.clientY - dragOffsetRef.current.dy - rect.top) / rect.height;
    const clamped = {
      x: Math.max(0, Math.min(1, Math.round(x * 1000) / 1000)),
      y: Math.max(0, Math.min(1, Math.round(y * 1000) / 1000)),
    };
    onRoomsChange(
      rooms.map((r) =>
        r.id === draggingRoomId
          ? { ...r, markerX: clamped.x, markerY: clamped.y }
          : r
      )
    );
  }

  function handleRoomPointerUp() {
    setDraggingRoomId(null);
    dragOffsetRef.current = null;
  }

  const updateRoom = useCallback(
    (id: string, patch: Partial<TourRoom>) => {
      onRoomsChange(
        rooms.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [rooms, onRoomsChange]
  );

  const deleteRoom = useCallback(
    (id: string) => {
      if (!confirm("Delete this room? Panoramas assigned to it become unassigned.")) return;
      onRoomsChange(rooms.filter((r) => r.id !== id));
      if (selectedRoomId === id) setSelectedRoomId(null);
    },
    [rooms, onRoomsChange, selectedRoomId]
  );

  async function handlePickFloorPlan() {
    if (pickingPlan) return;
    setPickingPlan(true);
    try {
      const id = await onPickFloorPlan();
      if (id) {
        setActiveFloorPlanId(id);
        setAddingRoomMode(true);
      }
    } finally {
      setPickingPlan(false);
    }
  }

  const selectedRoom = selectedRoomId
    ? rooms.find((r) => r.id === selectedRoomId) ?? null
    : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
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
          {rooms.length > 0 && (
            <span className="text-xs text-slate-500">
              · {rooms.length} room{rooms.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Place rooms · Each pano picks a room
        </span>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Plan picker + Add Room controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {usedFloorPlanIds.map((id) => {
              const f = projectFiles.find((pf) => pf.id === id);
              const isActive = id === activeFloorPlanId;
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
              {usedFloorPlanIds.length === 0
                ? "Add floor plan"
                : "Another plan"}
            </button>
            {activeFloorPlanId && (
              <button
                type="button"
                onClick={() => setAddingRoomMode((m) => !m)}
                className={`ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  addingRoomMode
                    ? "bg-emerald-600 text-white"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {addingRoomMode ? (
                  <>
                    <MapPin className="h-3 w-3" />
                    Click the plan to place...
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Add Room
                  </>
                )}
              </button>
            )}
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`relative rounded-lg border-2 ${
              addingRoomMode
                ? "border-emerald-500/60 border-dashed"
                : "border-white/[0.08] border-dashed"
            } overflow-hidden bg-black/20 transition-colors`}
            style={{
              minHeight: 320,
              cursor: addingRoomMode ? "crosshair" : "default",
            }}
          >
            {activeFloorPlanId ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${activeFloorPlanId}/download?inline=true`}
                  alt="Floor plan"
                  className="w-full h-auto block select-none"
                  draggable={false}
                />
                {activeRooms.map((room) => {
                  const isSelected = room.id === selectedRoomId;
                  const startingPano = room.startingPanoSectionId
                    ? panoramas.find(
                        (p) => p.id === room.startingPanoSectionId
                      )
                    : null;
                  const panoCount = panoramas.filter((p) => {
                    const meta = (p.metadata || {}) as PanoramaMetadata;
                    return meta.roomId === room.id;
                  }).length;
                  return (
                    <div
                      key={room.id}
                      onPointerDown={(e) => handleRoomPointerDown(e, room)}
                      onPointerMove={handleRoomPointerMove}
                      onPointerUp={handleRoomPointerUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoomId(room.id);
                      }}
                      className="group absolute z-10"
                      style={{
                        left: `${room.markerX * 100}%`,
                        top: `${room.markerY * 100}%`,
                        transform: "translate(-50%, -100%)",
                        opacity: draggingRoomId === room.id ? 0.5 : 1,
                        cursor: addingRoomMode
                          ? "crosshair"
                          : "grab",
                        touchAction: "none",
                      }}
                    >
                      <div className="flex flex-col items-center -mb-1">
                        <div
                          className={`rounded-md backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-white whitespace-nowrap shadow-lg select-none ${
                            isSelected
                              ? "bg-brand-600"
                              : "bg-black/80"
                          }`}
                          style={{
                            maxWidth: 160,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={
                            startingPano
                              ? `Starting: ${panoramaLabel(startingPano, 0)}`
                              : panoCount > 0
                                ? `${panoCount} pano${panoCount === 1 ? "" : "s"} — set a starting pano`
                                : "No panoramas assigned yet"
                          }
                        >
                          {room.name}
                        </div>
                        <div
                          className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
                          style={{
                            background: isSelected ? "#10b981" : "#3b82f6",
                            boxShadow: isSelected
                              ? "0 0 0 3px rgba(16,185,129,0.4), 0 2px 8px rgba(0,0,0,0.5)"
                              : "0 0 0 2px rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.5)",
                          }}
                        />
                        <div
                          className="w-0.5 bg-white/70"
                          style={{ height: 6, marginTop: -1 }}
                        />
                      </div>
                    </div>
                  );
                })}
                {activeRooms.length === 0 && !addingRoomMode && (
                  <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
                    <div className="mb-4 rounded-full bg-black/60 backdrop-blur-sm px-3 py-1.5 text-[10px] text-slate-300 uppercase tracking-wider">
                      Click &quot;Add Room&quot; to place a room
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

          {/* Selected room editor */}
          {selectedRoom && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/[0.04] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-brand-200 font-medium">
                  Editing room
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRoomId(null)}
                  className="text-slate-400 hover:text-white"
                  title="Done editing"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Room name
                </label>
                <input
                  type="text"
                  value={selectedRoom.name}
                  onChange={(e) =>
                    updateRoom(selectedRoom.id, { name: e.target.value })
                  }
                  placeholder="e.g. Lobby, Conference Hall"
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  Starting panorama
                </label>
                <select
                  value={selectedRoom.startingPanoSectionId ?? ""}
                  onChange={(e) =>
                    updateRoom(selectedRoom.id, {
                      startingPanoSectionId: e.target.value || null,
                    })
                  }
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                >
                  <option value="">— Pick a panorama —</option>
                  {panoramas.map((p, idx) => {
                    const meta = (p.metadata || {}) as PanoramaMetadata;
                    const inOtherRoom = Boolean(
                      meta.roomId && meta.roomId !== selectedRoom.id
                    );
                    return (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={inOtherRoom}
                      >
                        {panoramaLabel(p, idx)}
                        {inOtherRoom ? " (in another room)" : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                  Clicking this room&apos;s dot in the client viewer opens
                  the starting panorama. Other panos assigned to this
                  room are reached via hotspots.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => deleteRoom(selectedRoom.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete room
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
