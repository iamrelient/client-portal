"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, GripVertical } from "lucide-react";
import { canPreview3D, get3DFormat } from "@/lib/model-utils";
import { ModelViewer } from "@/components/model-viewer";

interface FileVersion {
  id: string;
  originalName: string;
  mimeType: string;
  version: number;
  size: number;
  createdAt: string;
}

interface FileComparisonModalProps {
  versions: FileVersion[];
  onClose: () => void;
}

type ViewMode = "side-by-side" | "slider";

export function FileComparisonModal({ versions, onClose }: FileComparisonModalProps) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const [leftId, setLeftId] = useState(sorted[0]?.id || "");
  const [rightId, setRightId] = useState(sorted[1]?.id || sorted[0]?.id || "");
  const [activePanel, setActivePanel] = useState<"left" | "right">("left");
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const leftFile = sorted.find((v) => v.id === leftId) || sorted[0];
  const rightFile = sorted.find((v) => v.id === rightId) || sorted[1] || sorted[0];

  const isImage = leftFile?.mimeType.startsWith("image/");
  const isPdf = leftFile?.mimeType === "application/pdf";
  const is3D = leftFile ? canPreview3D(leftFile.mimeType, leftFile.originalName) : false;

  // Close on Escape, arrow keys to cycle versions
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const currentIdx = sorted.findIndex(
          (v) => v.id === (activePanel === "left" ? leftId : rightId)
        );
        const nextIdx = Math.max(0, Math.min(sorted.length - 1, currentIdx + dir));
        if (activePanel === "left") setLeftId(sorted[nextIdx].id);
        else setRightId(sorted[nextIdx].id);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, leftId, rightId, activePanel, sorted]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Slider drag handlers
  const handleSliderMouseDown = useCallback(() => {
    dragging.current = true;
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current || !sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const pos = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPos(Math.max(5, Math.min(95, pos)));
    }
    function handleMouseUp() {
      dragging.current = false;
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  function VersionSelector({
    value,
    onChange,
    panel,
  }: {
    value: string;
    onChange: (id: string) => void;
    panel: "left" | "right";
  }) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setActivePanel(panel)}
        className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {sorted.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version} — {v.originalName}
          </option>
        ))}
      </select>
    );
  }

  function renderContent(file: FileVersion) {
    const url = `/api/files/${file.id}/download?inline=true`;

    if (is3D) {
      return (
        <div className="h-full w-full">
          <ModelViewer url={url} format={get3DFormat(file.originalName)!} />
        </div>
      );
    }

    if (isPdf) {
      return (
        <iframe src={url} className="h-full w-full rounded-lg border border-white/[0.08]" />
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto">
        <img src={url} alt={file.originalName} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#12141f]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-6">
        <h3 className="font-medium text-slate-100">Compare Versions</h3>
        <div className="flex items-center gap-3">
          {isImage && (
            <div className="flex rounded-lg border border-white/[0.1] overflow-hidden">
              <button
                onClick={() => setViewMode("side-by-side")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "side-by-side"
                    ? "bg-brand-500/20 text-brand-400"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setViewMode("slider")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "slider"
                    ? "bg-brand-500/20 text-brand-400"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                Slider
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Panels */}
      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        {viewMode === "slider" && isImage ? (
          /* Slider overlay mode */
          <div className="relative flex-1 min-h-0" ref={sliderRef}>
            {/* Version selectors on top */}
            <div className="absolute top-3 left-3 z-10">
              <VersionSelector value={leftId} onChange={setLeftId} panel="left" />
            </div>
            <div className="absolute top-3 right-3 z-10">
              <VersionSelector value={rightId} onChange={setRightId} panel="right" />
            </div>

            {/* Right image (full) */}
            <div className="absolute inset-0 flex items-center justify-center p-4 pt-14">
              <img
                src={`/api/files/${rightFile.id}/download?inline=true`}
                alt={rightFile.originalName}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Left image (clipped) */}
            <div
              className="absolute inset-0 flex items-center justify-center p-4 pt-14"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={`/api/files/${leftFile.id}/download?inline=true`}
                alt={leftFile.originalName}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            {/* Slider handle */}
            <div
              className="absolute top-14 bottom-0 z-20 flex w-1 cursor-col-resize items-center justify-center bg-white/30"
              style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
              onMouseDown={handleSliderMouseDown}
            >
              <div className="flex h-10 w-6 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <GripVertical className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
        ) : (
          /* Side-by-side mode */
          <>
            {/* Left panel */}
            <div
              className={`flex flex-1 flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] ${
                activePanel === "left" ? "ring-1 ring-inset ring-brand-500/30" : ""
              }`}
              onClick={() => setActivePanel("left")}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2">
                <VersionSelector value={leftId} onChange={setLeftId} panel="left" />
              </div>
              <div className="flex-1 min-h-0 p-2">
                {renderContent(leftFile)}
              </div>
            </div>

            {/* Right panel */}
            <div
              className={`flex flex-1 flex-col min-h-0 ${
                activePanel === "right" ? "ring-1 ring-inset ring-brand-500/30" : ""
              }`}
              onClick={() => setActivePanel("right")}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2">
                <VersionSelector value={rightId} onChange={setRightId} panel="right" />
              </div>
              <div className="flex-1 min-h-0 p-2">
                {renderContent(rightFile)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
