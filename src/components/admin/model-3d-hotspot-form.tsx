"use client";

import { useState, useMemo } from "react";
import type { Model3DHotspot, NavigateHotspot, PreviewHotspot } from "@/types/model3d";
import { Trash2, X } from "lucide-react";

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

interface Model3DHotspotFormProps {
  hotspot: Model3DHotspot | null;
  allSections: SectionOption[];
  projectFiles: FileOption[];
  onSave: (hotspot: Model3DHotspot) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function Model3DHotspotForm({
  hotspot,
  allSections,
  projectFiles,
  onSave,
  onCancel,
  onDelete,
}: Model3DHotspotFormProps) {
  const [hsType, setHsType] = useState<"navigate" | "preview">(
    hotspot?.type || "navigate"
  );
  const [label, setLabel] = useState(hotspot?.label || "");
  const [posX, setPosX] = useState(hotspot?.position.x ?? 0);
  const [posY, setPosY] = useState(hotspot?.position.y ?? 0.5);
  const [posZ, setPosZ] = useState(hotspot?.position.z ?? 0);
  const [targetChapter, setTargetChapter] = useState(
    hotspot?.targetChapter || ""
  );
  const [previewFileIds, setPreviewFileIds] = useState<string[]>(
    hotspot?.type === "preview" ? hotspot.previewFileIds : []
  );

  // Deduplicated chapter names
  const chapters = useMemo(() => {
    const set = new Set<string>();
    allSections
      .filter((s) => s.chapter)
      .forEach((s) => set.add(s.chapter!));
    return Array.from(set).sort();
  }, [allSections]);

  // Image files for preview picker
  const imageFiles = useMemo(
    () => projectFiles.filter((f) => f.mimeType.startsWith("image/")),
    [projectFiles]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !targetChapter) return;

    const id = hotspot?.id || crypto.randomUUID();
    const position = { x: posX, y: posY, z: posZ };

    if (hsType === "navigate") {
      const nav: NavigateHotspot = {
        id,
        type: "navigate",
        position,
        label: label.trim(),
        targetChapter,
      };
      onSave(nav);
    } else {
      const preview: PreviewHotspot = {
        id,
        type: "preview",
        position,
        label: label.trim(),
        targetChapter,
        previewFileIds: previewFileIds.filter(Boolean),
      };
      onSave(preview);
    }
  }

  const inputClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none";
  const selectClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none";
  const numClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-xs text-white font-mono focus:border-brand-500 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-slate-200">
          {hotspot ? "Edit Hotspot" : "New Hotspot"}
        </h4>
        <span className="text-[10px] text-slate-500 font-mono">
          {posX.toFixed(1)}, {posY.toFixed(1)}, {posZ.toFixed(1)}
        </span>
      </div>

      {/* Type toggle */}
      <div className="flex rounded-lg overflow-hidden border border-white/[0.1]">
        <button
          type="button"
          onClick={() => setHsType("navigate")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            hsType === "navigate"
              ? "bg-brand-600 text-white"
              : "bg-white/[0.05] text-slate-400 hover:text-white"
          }`}
        >
          Navigate
        </button>
        <button
          type="button"
          onClick={() => setHsType("preview")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            hsType === "preview"
              ? "bg-brand-600 text-white"
              : "bg-white/[0.05] text-slate-400 hover:text-white"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Position */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Position (X, Y, Z)
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          <input
            type="number"
            step="0.1"
            value={posX}
            onChange={(e) => setPosX(parseFloat(e.target.value) || 0)}
            className={numClass}
            placeholder="X"
          />
          <input
            type="number"
            step="0.1"
            value={posY}
            onChange={(e) => setPosY(parseFloat(e.target.value) || 0)}
            className={numClass}
            placeholder="Y"
          />
          <input
            type="number"
            step="0.1"
            value={posZ}
            onChange={(e) => setPosZ(parseFloat(e.target.value) || 0)}
            className={numClass}
            placeholder="Z"
          />
        </div>
      </div>

      {/* Label */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={
            hsType === "navigate" ? "e.g. Living Room" : "e.g. Kitchen View"
          }
          className={inputClass}
          required
        />
      </div>

      {/* Target Chapter */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Target Chapter
        </label>
        <select
          value={targetChapter}
          onChange={(e) => setTargetChapter(e.target.value)}
          className={selectClass}
          required
        >
          <option value="">Select chapter...</option>
          {chapters.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>
      </div>

      {/* Preview file IDs (preview type only) */}
      {hsType === "preview" && (
        <div>
          <label className="block text-[10px] font-medium text-slate-400 mb-1">
            Preview Images (up to 3)
          </label>
          <div className="space-y-1.5">
            {previewFileIds.map((fid, idx) => (
              <div key={idx} className="flex gap-1.5">
                <select
                  value={fid}
                  onChange={(e) => {
                    const updated = [...previewFileIds];
                    updated[idx] = e.target.value;
                    setPreviewFileIds(updated);
                  }}
                  className={selectClass}
                >
                  <option value="">Select image...</option>
                  {imageFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.originalName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewFileIds(previewFileIds.filter((_, i) => i !== idx));
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {previewFileIds.length < 3 && (
              <button
                type="button"
                onClick={() => setPreviewFileIds([...previewFileIds, ""])}
                className="w-full rounded-lg border border-dashed border-white/[0.15] px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 hover:border-white/[0.25] transition-colors"
              >
                + Add image
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {hotspot ? "Update" : "Add Hotspot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        {hotspot && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Delete hotspot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
