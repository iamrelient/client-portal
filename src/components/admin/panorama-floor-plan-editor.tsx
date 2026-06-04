"use client";

import { useState } from "react";
import type { PanoramaMetadata, TourRoom } from "@/types/panorama";
import { Compass, MapPin, RotateCcw } from "lucide-react";

interface PanoramaFloorPlanEditorProps {
  /** This panorama's section id — needed to detect whether this
   *  pano is currently the starting pano of any room. */
  sectionId: string;
  /** Current panorama metadata (read for roomId + northYaw). */
  metadata: PanoramaMetadata;
  /** Patch the metadata. Caller persists. */
  onMetadataChange: (patch: Partial<PanoramaMetadata>) => void;
  /** Full rooms list from the presentation. */
  rooms: TourRoom[];
  /** Patch a single room. Caller persists the whole rooms list. */
  onRoomChange: (id: string, patch: Partial<TourRoom>) => void;
  /** Capture the panorama viewer's current yaw — used for the
   *  north-calibration button. Returns null if no viewer is
   *  mounted (e.g. preview hasn't loaded yet). */
  onCaptureNorth?: () => number | null;
}

/**
 * Per-panorama "Floor Plan" tab — now Room Assignment.
 *
 *  In the new tour-rooms model the floor plan position lives on the
 *  room, not the panorama. This tab just assigns *which* room the
 *  pano belongs to, and toggles whether it's the starting pano for
 *  that room. North-calibration (per-pano) still lives here because
 *  each panorama's yaw 0 is independent.
 */
export function PanoramaFloorPlanEditor({
  sectionId,
  metadata,
  onMetadataChange,
  rooms,
  onRoomChange,
  onCaptureNorth,
}: PanoramaFloorPlanEditorProps) {
  const [justCaptured, setJustCaptured] = useState(false);

  const currentRoom = metadata.roomId
    ? rooms.find((r) => r.id === metadata.roomId) ?? null
    : null;
  const isStartingForCurrent =
    !!currentRoom && currentRoom.startingPanoSectionId === sectionId;

  function handleRoomChange(roomId: string) {
    // If we were the starting pano of the old room, clear that link
    // first so the room doesn't end up pointing at a pano that's no
    // longer in it.
    if (currentRoom && currentRoom.startingPanoSectionId === sectionId) {
      onRoomChange(currentRoom.id, { startingPanoSectionId: null });
    }
    onMetadataChange({ roomId: roomId || undefined });
  }

  function handleMakeStarting(checked: boolean) {
    if (!currentRoom) return;
    onRoomChange(currentRoom.id, {
      startingPanoSectionId: checked ? sectionId : null,
    });
  }

  function handleCaptureNorth() {
    if (!onCaptureNorth) return;
    const yaw = onCaptureNorth();
    if (yaw === null) return;
    onMetadataChange({ northYaw: yaw });
    setJustCaptured(true);
    window.setTimeout(() => setJustCaptured(false), 1200);
  }

  function handleClearNorth() {
    onMetadataChange({ northYaw: undefined });
  }

  const selectClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-3">
      {/* Room dropdown */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Room
        </label>
        <select
          value={metadata.roomId ?? ""}
          onChange={(e) => handleRoomChange(e.target.value)}
          className={selectClass}
        >
          <option value="">— Not in a room —</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {rooms.length === 0 && (
          <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
            No rooms yet. Open the Floor Plan section above and click
            <span className="text-slate-400"> Add Room</span> to place
            one on the plan, then come back here to assign this
            panorama to it.
          </p>
        )}
        {rooms.length > 0 && !metadata.roomId && (
          <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
            Unassigned panoramas don&apos;t appear as map dots and can
            only be reached via navigation hotspots from other panos.
          </p>
        )}
      </div>

      {/* Starting-pano toggle — only when a room is chosen */}
      {currentRoom && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isStartingForCurrent}
              onChange={(e) => handleMakeStarting(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-slate-200">
              Starting panorama for{" "}
              <span className="text-brand-300">{currentRoom.name}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                Clicking this room&apos;s dot in the client viewer opens
                this panorama. Other panos in the same room are
                reached via navigation hotspots.
              </span>
            </span>
          </label>
          {currentRoom.startingPanoSectionId &&
            currentRoom.startingPanoSectionId !== sectionId && (
              <p className="text-[10px] text-amber-300/80 ml-6">
                Another panorama is currently set as the starter for
                this room. Checking the box above will switch it.
              </p>
            )}
        </div>
      )}

      {/* North calibration — per pano, since each capture has its
          own yaw zero direction. */}
      {onCaptureNorth && (
        <div
          className={`rounded-lg border px-3 py-2.5 space-y-2 transition-colors ${
            justCaptured
              ? "border-emerald-500/40 bg-emerald-500/[0.08]"
              : "border-white/[0.08] bg-white/[0.02]"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Compass className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
              North Calibration
            </span>
            <span className="text-[10px] text-slate-500 ml-auto font-mono">
              {metadata.northYaw !== undefined
                ? `${metadata.northYaw.toFixed(0)}°`
                : "not set"}
            </span>
            {justCaptured && (
              <span className="text-[10px] text-emerald-400">✓</span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Pan the panorama on the left until you&apos;re facing the
            direction that reads as UP on the floor plan, then click
            Set as North. The minimap heading arrow uses this offset
            so it matches real-world orientation.
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCaptureNorth}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Compass className="h-3 w-3" />
              Set current view as North
            </button>
            {metadata.northYaw !== undefined && (
              <button
                type="button"
                onClick={handleClearNorth}
                title="Clear calibration (arrow rotates by raw yaw)"
                className="rounded-lg border border-white/[0.1] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hint reminder */}
      {!currentRoom && rooms.length > 0 && (
        <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />
          Pick a room above so this panorama shows on the floor plan.
        </p>
      )}
    </div>
  );
}
