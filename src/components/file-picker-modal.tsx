"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { chunkedUpload } from "@/lib/chunked-upload";
import { detectPanoramaFromFile } from "@/lib/pano-utils";

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
  /** When true (default), the picker also exposes an upload affordance:
   *  a button + drag-drop band that POSTs into the same project. New
   *  uploads land in the grid immediately and are auto-selected/picked
   *  so the admin doesn't have to hunt them down. */
  allowUpload?: boolean;
  /** Whether uploads from the picker should be flagged as presentation-
   *  only assets. Mirrors the page's `isPresentationAsset=true` upload
   *  so quick uploads don't clutter the project's main file tree.
   *  Defaults to true since every current call site is the presentation
   *  editor. */
  uploadIsPresentationAsset?: boolean;
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

/** A single in-flight upload — drives the progress strip at the bottom
 *  of the modal so admins can see what's happening when they drop ten
 *  panoramas at once. */
interface UploadRow {
  /** Local-only id so we can track rows pre-server-response. */
  localId: string;
  name: string;
  status: "uploading" | "done" | "error";
  /** 0-100 from the chunked uploader's onProgress. Stays null for the
   *  brief initial state before the first chunk lands. */
  progress?: number;
  /** Server-assigned file id once the POST resolves. */
  fileId?: string;
  errorMessage?: string;
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
  allowUpload = true,
  uploadIsPresentationAsset = true,
  onPick,
  onClose,
}: FilePickerModalProps) {
  const [files, setFiles] = useState<PickerFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** All uploads attempted in this modal session (success + failure +
   *  in-flight). Kept around so admins can see what happened even
   *  after the file list refreshes underneath them. */
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  /** When the user is mid-drag with files from their OS, light up the
   *  whole modal as a drop target so it's obvious where to release. */
  const [isDragOver, setIsDragOver] = useState(false);
  /** Counter for dragenter/dragleave bubbling — DOM nests dragleave
   *  events on every child the cursor crosses, so a naive boolean
   *  flickers. We track depth instead. */
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** Pull (or re-pull) the project's file list. Used at mount and
   *  again after every successful upload so the grid stays current. */
  async function refreshFiles() {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load files");
    }
  }

  useEffect(() => {
    let cancelled = false;
    refreshFiles().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // refreshFiles depends only on projectId via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /** Upload a single file via the chunked path — splits into 3.5 MB
   *  chunks so even 4K / RAW panoramas (10–50 MB) sail past Vercel's
   *  4.5 MB request-body limit. Streams progress back into the upload
   *  row so the strip shows real % instead of an indeterminate spinner.
   *
   *  Three round-trips per file:
   *    1. /upload-start         → opens a Google Drive resumable session
   *    2. /upload-chunk × N     → forwards each slice to Drive
   *    3. /upload-complete      → registers the File row in our DB
   *  All wrapped by chunkedUpload() in lib/chunked-upload.ts; we just
   *  add the finalize call here so isPresentationAsset / isPanorama
   *  metadata gets persisted with the row. */
  async function uploadOne(
    localId: string,
    file: globalThis.File
  ): Promise<string | null> {
    try {
      // Detect 360° aspect *before* upload so the server can skip the
      // baked-in corner watermark (panoramas get a floor-projected
      // watermark at serve time instead — corner stamp on a sphere
      // looks distorted).
      const isPanorama = await detectPanoramaFromFile(file);

      // Step 1+2: stream the bytes to Drive via the chunk pipeline.
      const { driveFileId, size } = await chunkedUpload({
        file,
        projectId,
        onProgress: (percent) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.localId === localId ? { ...u, progress: percent } : u
            )
          );
        },
      });

      // Step 3: register the DB row. The endpoint also runs the
      // post-upload watermark pass (skipped for panoramas).
      const finalizeRes = await fetch(
        `/api/projects/${projectId}/upload-complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driveFileId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size,
            isPanorama,
            isPresentationAsset: uploadIsPresentationAsset,
          }),
        }
      );

      if (!finalizeRes.ok) {
        const body = await finalizeRes.json().catch(() => ({}));
        setUploads((prev) =>
          prev.map((u) =>
            u.localId === localId
              ? {
                  ...u,
                  status: "error",
                  errorMessage:
                    (body as { error?: string }).error ||
                    "Failed to finalize upload",
                }
              : u
          )
        );
        return null;
      }

      const data = await finalizeRes.json();
      const fileId: string | undefined = data?.fileId;
      setUploads((prev) =>
        prev.map((u) =>
          u.localId === localId
            ? { ...u, status: "done", progress: 100, fileId }
            : u
        )
      );
      return fileId ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploads((prev) =>
        prev.map((u) =>
          u.localId === localId
            ? { ...u, status: "error", errorMessage: message }
            : u
        )
      );
      return null;
    }
  }

  /** Kick off a batch of uploads — runs them in parallel, then on the
   *  back side refreshes the file list and auto-selects (multi) or
   *  auto-picks (single + exactly 1 file) the new ids. */
  async function handleFilesPicked(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Prefilter by accept so we don't waste a POST on something the
    // grid will hide anyway. Permissive: if the accept is "image/*"
    // and the file has no type, let it through — sharp will detect.
    const acceptable = files.filter((f) => {
      if (!f.type) return true;
      return matchesAccept(f.type, accept);
    });
    if (acceptable.length === 0) return;

    // Seed upload rows so the progress strip renders immediately.
    const rows: UploadRow[] = acceptable.map((f) => ({
      localId: crypto.randomUUID(),
      name: f.name,
      status: "uploading" as const,
    }));
    setUploads((prev) => [...prev, ...rows]);

    const results = await Promise.all(
      rows.map((row, i) => uploadOne(row.localId, acceptable[i]))
    );
    const newIds = results.filter((id): id is string => !!id);

    await refreshFiles();

    if (newIds.length === 0) return;

    if (multiSelect) {
      // Pre-check the uploaded ones so the "Add N files" button is
      // immediately useful — admin can still toggle others on/off.
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.add(id);
        return next;
      });
    } else if (newIds.length === 1) {
      // Single-select + one upload = unambiguous intent; auto-pick
      // and close so the admin doesn't have to click again.
      onPick([newIds[0]]);
      onClose();
    }
    // Single-select + multiple uploads: leave the modal open with
    // the new files visible; admin clicks the one they want.
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    handleFilesPicked(e.target.files);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
  }

  // Drag-over the whole modal: only react to actual file drags from
  // the OS. We sniff dataTransfer.types for "Files" — that's how
  // browsers signal external file drags vs internal element drags.
  function onModalDragEnter(e: React.DragEvent) {
    if (!allowUpload) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }
  function onModalDragLeave(e: React.DragEvent) {
    if (!allowUpload) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }
  function onModalDragOver(e: React.DragEvent) {
    if (!allowUpload) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onModalDrop(e: React.DragEvent) {
    if (!allowUpload) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesPicked(e.dataTransfer.files);
    }
  }

  const visible = useMemo(() => {
    if (!files) return [];
    const q = query.trim().toLowerCase();
    return files
      .filter((f) => matchesAccept(f.mimeType, accept))
      .filter((f) => (q ? f.originalName.toLowerCase().includes(q) : true));
  }, [files, accept, query]);

  const anyUploadInFlight = uploads.some((u) => u.status === "uploading");
  const completedUploads = uploads.filter((u) => u.status === "done").length;
  const failedUploads = uploads.filter((u) => u.status === "error").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#12141f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onDragEnter={onModalDragEnter}
        onDragLeave={onModalDragLeave}
        onDragOver={onModalDragOver}
        onDrop={onModalDrop}
      >
        {/* Hidden file input for the Upload button. `multiple` because
            picking 10 panoramas in one shot is a common workflow. */}
        {allowUpload && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={onFileInputChange}
          />
        )}

        {/* OS-drag overlay — covers the whole modal so the admin can
            drop anywhere, not just on a fiddly drop zone. */}
        {isDragOver && allowUpload && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-brand-500/15 backdrop-blur-sm border-4 border-dashed border-brand-400/70 rounded-xl">
            <div className="flex flex-col items-center gap-2 text-brand-100">
              <Upload className="h-10 w-10" />
              <p className="text-sm font-medium">Drop to upload</p>
              <p className="text-xs text-brand-200/80">
                Files go straight into this project
              </p>
            </div>
          </div>
        )}

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
          <div className="flex items-center gap-2">
            {allowUpload && (
              <button
                onClick={triggerFileInput}
                disabled={anyUploadInFlight}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {anyUploadInFlight ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tiny hint band — only shown when upload is enabled and the
            admin hasn't started uploading yet. Disappears after first
            upload to give the progress strip its full attention. */}
        {allowUpload && uploads.length === 0 && (
          <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] text-slate-500 flex items-center gap-2">
            <Upload className="h-3 w-3" />
            Drop files anywhere to upload, or click the Upload button —
            multiple files at once is fine.
          </div>
        )}

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
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-400">
              <FileText className="h-8 w-8 text-slate-600" />
              <p>
                {query
                  ? "No matches for that search."
                  : "No files in this project match the expected type."}
              </p>
              {allowUpload && !query && (
                <button
                  onClick={triggerFileInput}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.15] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.05] transition-colors"
                >
                  <Upload className="h-3 w-3" />
                  Upload one now
                </button>
              )}
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
                /** Light green ring on tiles that were just uploaded in
                 *  this modal session — gives admins instant visual
                 *  confirmation their upload landed. */
                const isFreshlyUploaded = uploads.some(
                  (u) => u.fileId === f.id && u.status === "done"
                );
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
                        : isFreshlyUploaded
                          ? "border-emerald-500/40 bg-emerald-500/[0.05] hover:border-emerald-500/70"
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
                      {isFreshlyUploaded && !isSelected && (
                        <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                          New
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

        {/* Upload progress strip — only renders once at least one
            upload has been attempted. Each row stays visible after
            completion so the admin can see what landed (and what
            didn't) without scrolling. */}
        {uploads.length > 0 && (
          <div className="border-t border-white/[0.08] bg-white/[0.02] max-h-[120px] overflow-y-auto">
            <div className="px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 sticky top-0 bg-[#12141f]/95 backdrop-blur-sm border-b border-white/[0.04]">
              <span>
                Uploads · {completedUploads}/{uploads.length} done
                {failedUploads > 0 && (
                  <span className="text-red-400">
                    {" "}
                    · {failedUploads} failed
                  </span>
                )}
              </span>
              {!anyUploadInFlight && (
                <button
                  onClick={() => setUploads([])}
                  className="text-slate-500 hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="px-4 py-1.5 space-y-1.5">
              {uploads.map((u) => (
                <div key={u.localId} className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs">
                    {u.status === "uploading" && (
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />
                    )}
                    {u.status === "done" && (
                      <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                    )}
                    {u.status === "error" && (
                      <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                    )}
                    <span className="truncate text-slate-300 flex-1">
                      {u.name}
                    </span>
                    {u.status === "uploading" && u.progress !== undefined && (
                      <span className="text-slate-500 text-[10px] font-mono shrink-0">
                        {u.progress}%
                      </span>
                    )}
                    {u.errorMessage && (
                      <span className="text-red-400 text-[10px] shrink-0">
                        {u.errorMessage}
                      </span>
                    )}
                  </div>
                  {/* Slim progress bar — only while in flight. Width
                      derived from the chunked uploader's % callback
                      so the admin sees real movement on big files. */}
                  {u.status === "uploading" && (
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full bg-brand-500 transition-[width] duration-200 ease-out"
                        style={{ width: `${u.progress ?? 0}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                disabled={selected.size === 0 || anyUploadInFlight}
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
