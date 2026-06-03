"use client";

import { useCallback, useRef, useState } from "react";
import type { PanoramaMetadata } from "@/types/panorama";
import { Compass, Loader2, Plus, RotateCcw, X } from "lucide-react";

interface FileOption {
  id: string;
  originalName: string;
  mimeType: string;
}

interface PanoramaFloorPlanEditorProps {
  floorPlan: PanoramaMetadata["floorPlan"];
  projectFiles: FileOption[];
  onChange: (floorPlan: PanoramaMetadata["floorPlan"]) => void;
  /** Optional: lets the admin pick or upload a floor plan image
   *  right from this panel. Resolves with the new file's id (auto-
   *  selected as the floor plan), or null if the picker was
   *  dismissed. */
  onAddFloorPlan?: () => Promise<string | null>;
  /** Capture the panorama viewer's current yaw and stamp it on
   *  metadata.floorPlan.northYaw — so the heading arrow in the
   *  client viewer reads correctly relative to the floor plan. The
   *  parent component owns viewerRef, so it provides this callback.
   *  Returns the captured yaw (rounded) or null if no viewer is
   *  mounted. */
  onCaptureNorth?: () => number | null;
}

export function PanoramaFloorPlanEditor({
  floorPlan,
  projectFiles,
  onChange,
  onAddFloorPlan,
  onCaptureNorth,
}: PanoramaFloorPlanEditorProps) {
  const [adding, setAdding] = useState(false);
  /** Brief visual ping after capture so the admin knows the gesture
   *  registered (the change is otherwise just a tiny arrow rotation
   *  in the preview). */
  const [justCaptured, setJustCaptured] = useState(false);

  function handleCaptureNorth() {
    if (!onCaptureNorth || !floorPlan) return;
    const yaw = onCaptureNorth();
    if (yaw === null) return;
    onChange({
      ...floorPlan,
      northYaw: yaw,
    });
    setJustCaptured(true);
    window.setTimeout(() => setJustCaptured(false), 1200);
  }

  function handleClearNorth() {
    if (!floorPlan) return;
    const { northYaw: _drop, ...rest } = floorPlan;
    void _drop;
    onChange(rest);
  }

  async function handleAddFloorPlan() {
    if (!onAddFloorPlan || adding) return;
    setAdding(true);
    try {
      const newId = await onAddFloorPlan();
      if (newId) {
        onChange({
          imageFileId: newId,
          markerX: floorPlan?.markerX ?? 0.5,
          markerY: floorPlan?.markerY ?? 0.5,
        });
      }
    } finally {
      setAdding(false);
    }
  }
  const imgRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!floorPlan?.imageFileId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      onChange({
        ...floorPlan,
        markerX: Math.round(x * 1000) / 1000,
        markerY: Math.round(y * 1000) / 1000,
      });
    },
    [floorPlan, onChange]
  );

  const selectClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none";

  const imageFiles = projectFiles.filter((f) =>
    f.mimeType.startsWith("image/")
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Floor Plan Image
        </label>
        <div className="flex gap-1.5">
          <select
            value={floorPlan?.imageFileId || ""}
            onChange={(e) => {
              if (e.target.value) {
                onChange({
                  imageFileId: e.target.value,
                  markerX: floorPlan?.markerX ?? 0.5,
                  markerY: floorPlan?.markerY ?? 0.5,
                });
              } else {
                onChange(undefined);
              }
            }}
            className={selectClass}
          >
            <option value="">No floor plan</option>
            {imageFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.originalName}
              </option>
            ))}
          </select>
          {onAddFloorPlan && (
            <button
              type="button"
              onClick={handleAddFloorPlan}
              disabled={adding}
              title="Pick a project image or upload a new floor plan"
              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] disabled:opacity-50 transition-colors"
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {floorPlan && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-red-400 transition-colors"
              title="Remove floor plan"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {imageFiles.length === 0 && onAddFloorPlan && (
          <p className="mt-1 text-[10px] text-slate-500">
            No images in this project yet — click + to pick or upload one.
          </p>
        )}
      </div>

      {floorPlan?.imageFileId && (
        <>
          <p className="text-[10px] text-slate-500">
            Click on the image to place the room marker.
          </p>
          <div
            ref={imgRef}
            onClick={handleImageClick}
            className="relative rounded-lg overflow-hidden border border-white/[0.08] cursor-crosshair"
            style={{ maxHeight: 200 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${floorPlan.imageFileId}/download?inline=true`}
              alt="Floor plan"
              className="w-full h-auto"
              style={{ maxHeight: 200, objectFit: "contain" }}
              draggable={false}
            />
            {/* Marker + calibrated heading preview. Lets the admin
                see the arrow's resulting direction before committing
                — pan the pano, click Set North, watch the arrow snap
                to point up. */}
            <div
              style={{
                position: "absolute",
                left: `${(floorPlan.markerX ?? 0.5) * 100}%`,
                top: `${(floorPlan.markerY ?? 0.5) * 100}%`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  border: "2px solid white",
                  boxShadow: "0 0 0 2px rgba(59,130,246,0.4)",
                }}
              />
              {/* Heading arrow — shows the captured "north" direction
                  as a static reference so the admin can verify it
                  points the right way on the plan. Arrow points UP
                  when northYaw is the current view direction. */}
              {floorPlan.northYaw !== undefined && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: 20,
                    height: 20,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -6,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "4px solid transparent",
                      borderRight: "4px solid transparent",
                      borderBottom: "6px solid rgba(59,130,246,0.95)",
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 flex gap-4">
            <div className="text-[10px]">
              <span className="text-slate-500">X: </span>
              <span className="text-slate-300 font-mono">
                {((floorPlan.markerX ?? 0.5) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px]">
              <span className="text-slate-500">Y: </span>
              <span className="text-slate-300 font-mono">
                {((floorPlan.markerY ?? 0.5) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] ml-auto">
              <span className="text-slate-500">North: </span>
              <span className="text-slate-300 font-mono">
                {floorPlan.northYaw !== undefined
                  ? `${floorPlan.northYaw.toFixed(0)}°`
                  : "not set"}
              </span>
            </div>
          </div>

          {/* North calibration controls. Pan the panorama (on the
              left) until you're looking in the direction you want to
              read as UP on the floor plan, then click Set as North.
              The viewer's heading arrow will use this offset so it
              points correctly relative to the real world. */}
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
                {justCaptured && (
                  <span className="text-[10px] text-emerald-400 ml-auto">
                    ✓ Saved
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Pan the panorama on the left until you&apos;re facing the
                direction that should read as UP on the floor plan
                (e.g. the building&apos;s front), then click Set as North.
                The client-viewer heading arrow will rotate from there.
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
                {floorPlan.northYaw !== undefined && (
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
        </>
      )}
    </div>
  );
}
