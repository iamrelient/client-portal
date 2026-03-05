"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Download, X, Archive } from "lucide-react";

type FileCategory = "RENDER" | "DRAWING" | "CAD_DRAWING" | "SUPPORTING" | "DESIGN_INSPIRATION" | "OTHER";

const CATEGORY_LABELS: Record<FileCategory, string> = {
  RENDER: "Renders",
  DRAWING: "Drawings",
  CAD_DRAWING: "CAD Drawings",
  SUPPORTING: "Owner Provided",
  DESIGN_INSPIRATION: "Design Inspirations",
  OTHER: "Others",
};

const CATEGORY_ORDER: FileCategory[] = [
  "RENDER",
  "DRAWING",
  "CAD_DRAWING",
  "SUPPORTING",
  "DESIGN_INSPIRATION",
  "OTHER",
];

interface CategoryInfo {
  category: FileCategory;
  count: number;
  hasOldVersions: boolean;
}

interface DownloadOptionsModalProps {
  categories: CategoryInfo[];
  onDownload: (selectedCategories: FileCategory[], includeOldVersions: boolean) => void;
  onClose: () => void;
}

export function DownloadOptionsModal({
  categories,
  onDownload,
  onClose,
}: DownloadOptionsModalProps) {
  const availableCategories = CATEGORY_ORDER.filter((cat) =>
    categories.some((c) => c.category === cat && c.count > 0)
  );

  const [selected, setSelected] = useState<Set<FileCategory>>(
    new Set(availableCategories)
  );
  const [includeOldVersions, setIncludeOldVersions] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const allSelected = selected.size === availableCategories.length;
  const noneSelected = selected.size === 0;
  const someSelected = !allSelected && !noneSelected;

  const hasAnyOldVersions = categories.some((c) => c.hasOldVersions);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Keyboard: Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableCategories));
    }
  }

  function toggleCategory(cat: FileCategory) {
    const next = new Set(selected);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setSelected(next);
  }

  function handleDownload() {
    onDownload(Array.from(selected), includeOldVersions);
  }

  const allCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allCheckboxRef.current) {
      allCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#12141f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-brand-400" />
            <h3 className="text-lg font-semibold text-slate-100">Download Files</h3>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-400">
            Select which categories to include in the download.
          </p>

          {/* All checkbox */}
          <label className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 cursor-pointer hover:bg-white/[0.05] transition-colors">
            <input
              ref={allCheckboxRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-500 focus:ring-brand-500"
            />
            <span className="font-medium text-slate-100">All Categories</span>
            <span className="ml-auto text-xs text-slate-400">
              {categories.reduce((sum, c) => sum + c.count, 0)} files
            </span>
          </label>

          {/* Per-category checkboxes */}
          <div className="space-y-1 ml-2">
            {availableCategories.map((cat) => {
              const info = categories.find((c) => c.category === cat)!;
              return (
                <label
                  key={cat}
                  className="flex items-center gap-3 rounded-lg px-4 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-500 focus:ring-brand-500"
                  />
                  <span className="text-sm text-slate-200">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="ml-auto inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-slate-400">
                    {info.count}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Include old versions */}
          {hasAnyOldVersions && (
            <label className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 cursor-pointer hover:bg-white/[0.05] transition-colors mt-2">
              <input
                type="checkbox"
                checked={includeOldVersions}
                onChange={(e) => setIncludeOldVersions(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-500 focus:ring-brand-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-200">
                  Include old versions
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Old versions will be placed in &quot;Old Versions&quot; subfolders
                </p>
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={noneSelected}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-4 w-4" />
            Download .zip
          </button>
        </div>
      </div>
    </div>
  );
}
