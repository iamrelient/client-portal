"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, X } from "lucide-react";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";

interface PickerFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category?: string | null;
  isOutdated?: boolean;
  isPanorama?: boolean;
}

interface FilePickerModalProps {
  projectId: string;
  /** Accept string like "image/*" or "video/*". Used to filter the list. */
  accept: string;
  /** Optional title override. */
  title?: string;
  /** When true, show checkboxes and a confirm button so the caller can
   *  pick multiple files at once. Defaults to single-select (clicking a
   *  tile immediately closes and returns that one id). */
  multiSelect?: boolean;
  /** Receives an array of selected file ids. In single-select mode it
   *  has exactly one element. */
  onPick: (fileIds: string[]) => void;
  onClose: () => void;
}

function matchesAccept(mimeType: string, accept: string): boolean {
  if (!accept || accept === "*") return true;
  // Normalize — supports "image/*", "video/*", "*/*", or a specific mime.
  const trimmed = accept.trim();
  if (trimmed === "*/*") return true;
  if (trimmed.endsWith("/*")) {
    const prefix = trimmed.slice(0, -1); // keep trailing "/"
    return mimeType.startsWith(prefix);
  }
  return mimeType === trimmed;
}

/** Modal with a thumbnail grid of a project's files, filtered by mime type.
 *  Clicking a tile hands the fileId back to the caller and closes the modal.
 *  Used by the presentation editor to re-use existing renders/videos/etc.
 *  without re-uploading them. */
export function FilePickerModal({
  projectId,
  accept,
  title,
  multiSelect = false,
  onPick,
  onClose,
}: FilePickerModalProps) {
  const [files, setFiles] = useState<PickerFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmMulti() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    onPick(ids);
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/files`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data) => {
        if (!cancelled) setFiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load files");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Lock body scroll while open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    if (!files) return [];
    const q = query.trim().toLowerCase();
    return files
      .filter((f) => matchesAccept(f.mimeType, accept))
      .filter((f) => (q ? f.originalName.toLowerCase().includes(q) : true));
  }, [files, accept, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#12141f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-slate-100">
              {title || "Pick a file"}
            </h3>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by filename…"
              className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {files === null && !error && (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-red-400">
              {error}
            </div>
          )}
          {files !== null && !error && visible.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
              <FileText className="h-8 w-8 text-slate-600" />
              <p>
                {query
                  ? "No matches for that search."
                  : "No files in this project match the expected type."}
              </p>
            </div>
          )}
          {visible.length > 0 && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((f) => {
                const isImage = f.mimeType.startsWith("image/");
                const Icon = getFileIcon(f.mimeType, f.originalName, {
                  isPanorama: !!f.isPanorama,
                });
                const label = getFileLabel(f.mimeType, f.originalName, {
                  isPanorama: !!f.isPanorama,
                });
                const isSelected = selected.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      if (multiSelect) {
                        toggleSelected(f.id);
                      } else {
                        onPick([f.id]);
                        onClose();
                      }
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-colors focus:border-brand-500 focus:outline-none ${
                      isSelected
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-brand-500/40 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="relative aspect-video bg-black/30">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${f.id}/download?inline=true`}
                          alt={f.originalName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon className="h-10 w-10 text-slate-500" />
                        </div>
                      )}
                      {f.isOutdated && (
                        <span className="absolute left-2 top-2 rounded-full bg-amber-500/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                          Outdated
                        </span>
                      )}
                      {multiSelect && (
                        <span
                          className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                            isSelected
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-white/50 bg-black/50 text-transparent"
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate text-sm text-slate-200">
                        {f.originalName}
                      </span>
                      <span className="flex-shrink-0 text-xs text-slate-500">
                        {label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {multiSelect && (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3">
            <span className="text-sm text-slate-400">
              {selected.size === 0
                ? "Select one or more files"
                : `${selected.size} selected`}
            </span>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={confirmMulti}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Add {selected.size > 0 ? selected.size : ""}{" "}
                {selected.size === 1 ? "file" : "files"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
