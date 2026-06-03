"use client";

import { useCallback, useRef, useState } from "react";
import type { PanoramaMetadata } from "@/types/panorama";
import { Loader2, Plus, X } from "lucide-react";

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
}

export function PanoramaFloorPlanEditor({
  floorPlan,
  projectFiles,
  onChange,
  onAddFloorPlan,
}: PanoramaFloorPlanEditorProps) {
  const [adding, setAdding] = useState(false);

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
            {/* Marker */}
            <div
              style={{
                position: "absolute",
                left: `${(floorPlan.markerX ?? 0.5) * 100}%`,
                top: `${(floorPlan.markerY ?? 0.5) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#3b82f6",
                border: "2px solid white",
                boxShadow: "0 0 0 2px rgba(59,130,246,0.4)",
                pointerEvents: "none",
              }}
            />
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
          </div>
        </>
      )}
    </div>
  );
}
