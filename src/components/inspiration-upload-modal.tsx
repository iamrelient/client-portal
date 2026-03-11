"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, Globe, Loader2, Image as ImageIcon, Link, ChevronRight } from "lucide-react";
import { chunkedUpload } from "@/lib/chunked-upload";

interface QueuedFile {
  file: File;
  preview: string | null;
  notes: string;
  boardType: "INTERIOR" | "EXTERIOR" | null;
}

interface InspirationUploadModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  userRole: "ADMIN" | "USER";
  onSuccess: () => void;
  /** Pre-populated files from drag-and-drop on the add card */
  initialFiles?: File[];
  /** Default board type from the section the user dropped onto */
  defaultBoardType?: "INTERIOR" | "EXTERIOR" | null;
}

type TabMode = "upload" | "url";

export function InspirationUploadModal({
  open,
  onClose,
  projectId,
  userRole,
  onSuccess,
  initialFiles,
  defaultBoardType,
}: InspirationUploadModalProps) {
  const [tab, setTab] = useState<TabMode>("upload");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [urlNotes, setUrlNotes] = useState("");
  const [urlBoardType, setUrlBoardType] = useState<"INTERIOR" | "EXTERIOR" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-initialize state whenever the modal opens
  useEffect(() => {
    if (!open) return;

    if (initialFiles && initialFiles.length > 0) {
      const newQueue: QueuedFile[] = initialFiles.map((f) => ({
        file: f,
        preview: null,
        notes: "",
        boardType: defaultBoardType || null,
      }));
      setQueue(newQueue);
      setCurrentIndex(0);
      setTab("upload");
      setError(null);
      setProgress(0);

      // Generate previews for images
      newQueue.forEach((item, idx) => {
        if (item.file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setQueue((prev) =>
              prev.map((q, i) =>
                i === idx ? { ...q, preview: e.target?.result as string } : q
              )
            );
          };
          reader.readAsDataURL(item.file);
        }
      });
    } else {
      // Opened via click (no initial files)
      setQueue([]);
      setCurrentIndex(0);
      setUrlInput("");
      setUrlNotes("");
      setUrlBoardType(defaultBoardType || null);
      setError(null);
      setProgress(0);
    }
  }, [open, initialFiles, defaultBoardType]);

  const currentItem = queue[currentIndex] || null;
  const totalFiles = queue.length;
  const isLastFile = currentIndex >= totalFiles - 1;

  // Add files to queue (from modal's own drop zone / file picker)
  const handleAddFiles = useCallback(
    (newFiles: File[]) => {
      const additions: QueuedFile[] = newFiles.map((f) => ({
        file: f,
        preview: null,
        notes: "",
        boardType: defaultBoardType || null,
      }));

      setQueue((prev) => {
        const updated = [...prev, ...additions];
        // Generate previews
        additions.forEach((item, addIdx) => {
          if (item.file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (e) => {
              setQueue((curr) =>
                curr.map((q, i) =>
                  i === prev.length + addIdx
                    ? { ...q, preview: e.target?.result as string }
                    : q
                )
              );
            };
            reader.readAsDataURL(item.file);
          }
        });
        return updated;
      });
      setTab("upload");
    },
    [defaultBoardType]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (uploading) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleAddFiles(files);
    },
    [uploading, handleAddFiles]
  );

  function updateCurrentNotes(notes: string) {
    setQueue((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, notes } : q))
    );
  }

  function updateCurrentBoardType(bt: "INTERIOR" | "EXTERIOR") {
    setQueue((prev) =>
      prev.map((q, i) => (i === currentIndex ? { ...q, boardType: bt } : q))
    );
  }

  const completeEndpoint =
    userRole === "ADMIN"
      ? `/api/projects/${projectId}/upload-complete`
      : `/api/projects/${projectId}/inspiration`;

  async function handleUploadCurrent() {
    setError(null);

    if (tab === "url") {
      await uploadUrl();
      return;
    }

    if (!currentItem) return;

    setUploading(true);
    try {
      await uploadSingleFile(currentItem);

      if (isLastFile) {
        resetAndClose();
      } else {
        setCurrentIndex((prev) => prev + 1);
        setProgress(0);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadSingleFile(item: QueuedFile) {
    setProgress(0);
    const { driveFileId, size } = await chunkedUpload({
      file: item.file,
      projectId,
      onProgress: (percent) => setProgress(percent),
      onRetry: (attempt, max) =>
        setError(`Retrying upload (attempt ${attempt}/${max})…`),
    });
    setError(null);

    const completeRes = await fetch(completeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId,
        fileName: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        size,
        category: "DESIGN_INSPIRATION",
        displayName: null,
        notes: item.notes.trim() || null,
        boardType: item.boardType,
      }),
    });

    if (!completeRes.ok) {
      const data = await completeRes
        .json()
        .catch(() => ({ error: "Failed to register file" }));
      throw new Error(data.error);
    }

    // Refresh the board after each file so user sees them appear
    onSuccess();
  }

  async function uploadUrl() {
    let url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    setUploading(true);
    try {
      let displayName = url;
      try {
        displayName = new URL(url).hostname.replace(/^www\./, "");
      } catch {}

      const res = await fetch(completeEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          displayName,
          category: "DESIGN_INSPIRATION",
          notes: urlNotes.trim() || null,
          boardType: urlBoardType,
        }),
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Failed to add URL" }));
        throw new Error(data.error);
      }

      resetAndClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add URL");
    } finally {
      setUploading(false);
    }
  }

  function resetAndClose() {
    setQueue([]);
    setCurrentIndex(0);
    setUrlInput("");
    setUrlNotes("");
    setUrlBoardType(defaultBoardType || null);
    setProgress(0);
    setError(null);
    onClose();
  }

  if (!open) return null;

  const activeBoardType =
    tab === "url" ? urlBoardType : currentItem?.boardType ?? null;
  const activeNotes = tab === "url" ? urlNotes : currentItem?.notes ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#12141f] border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-lg font-semibold text-slate-100">
            Add Inspiration
            {totalFiles > 1 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({currentIndex + 1} of {totalFiles})
              </span>
            )}
          </h3>
          <button
            onClick={resetAndClose}
            disabled={uploading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="mx-6 mt-3 flex rounded-lg bg-white/[0.04] p-1">
          <button
            onClick={() => !uploading && setTab("upload")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "upload"
                ? "bg-white/[0.08] text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Upload Image
          </button>
          <button
            onClick={() => !uploading && setTab("url")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "url"
                ? "bg-white/[0.08] text-slate-100 shadow-sm"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Link className="h-4 w-4" />
            Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {tab === "upload" ? (
            <>
              {/* Drop zone / preview for current file */}
              {currentItem && currentItem.preview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
                  <img
                    src={currentItem.preview}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                  {totalFiles <= 1 && (
                    <button
                      onClick={() => {
                        setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
                        if (currentIndex > 0) setCurrentIndex((p) => p - 1);
                      }}
                      disabled={uploading}
                      className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : currentItem ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-white/[0.06] p-2.5">
                    <Upload className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {currentItem.file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(currentItem.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  {totalFiles <= 1 && (
                    <button
                      onClick={() => {
                        setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
                        if (currentIndex > 0) setCurrentIndex((p) => p - 1);
                      }}
                      disabled={uploading}
                      className="rounded-lg p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => !uploading && inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-white/[0.12] p-8 text-center hover:border-pink-500/40 hover:bg-pink-500/[0.03] transition-colors"
                >
                  <Upload className="mx-auto h-8 w-8 text-slate-500" />
                  <p className="mt-2 text-sm font-medium text-slate-300">
                    Drop images here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Any image or file type &middot; multiple files supported
                  </p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) handleAddFiles(files);
                  e.target.value = "";
                }}
              />
            </>
          ) : (
            <>
              {/* URL input */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Website URL
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/inspiration"
                      disabled={uploading}
                      className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:opacity-50"
                    />
                  </div>
                </div>
                {urlInput.trim() && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                    <Globe className="h-4 w-4 text-pink-400 flex-shrink-0" />
                    <span className="text-sm text-slate-300 truncate">
                      {(() => {
                        try {
                          let url = urlInput.trim();
                          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
                          return new URL(url).hostname.replace(/^www\./, "");
                        } catch {
                          return urlInput.trim();
                        }
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Board Type selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Board
            </label>
            <div className="flex gap-2">
              {(["INTERIOR", "EXTERIOR"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    if (tab === "url") {
                      setUrlBoardType(type);
                    } else {
                      updateCurrentBoardType(type);
                    }
                  }}
                  disabled={uploading}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeBoardType === type
                      ? "bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/50"
                      : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]"
                  } disabled:opacity-50`}
                >
                  {type === "INTERIOR" ? "Interior" : "Exterior"}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Add a note <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={activeNotes}
              onChange={(e) => {
                if (tab === "url") {
                  setUrlNotes(e.target.value);
                } else {
                  updateCurrentNotes(e.target.value);
                }
              }}
              placeholder="What do you like about this?"
              disabled={uploading}
              rows={2}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none disabled:opacity-50"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Progress bar */}
          {uploading && tab === "upload" && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pink-500 to-pink-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={resetAndClose}
            disabled={uploading}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUploadCurrent}
            disabled={
              uploading ||
              (tab === "upload" ? !currentItem : !urlInput.trim())
            }
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-pink-600 px-5 py-2.5 text-sm font-medium text-white hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tab === "upload" && !isLastFile && totalFiles > 1 ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {tab === "upload" && !isLastFile && totalFiles > 1
              ? "Add & Next"
              : "Add to Mood Board"}
          </button>
        </div>
      </div>
    </div>
  );
}
