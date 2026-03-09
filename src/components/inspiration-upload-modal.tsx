"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Globe, Loader2, Image as ImageIcon, Link } from "lucide-react";
import { chunkedUpload } from "@/lib/chunked-upload";

interface InspirationUploadModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  userRole: "ADMIN" | "USER";
  onSuccess: () => void;
  /** Pre-populated file from drag-and-drop on the add card */
  initialFile?: File | null;
}

type TabMode = "upload" | "url";

export function InspirationUploadModal({
  open,
  onClose,
  projectId,
  userRole,
  onSuccess,
  initialFile,
}: InspirationUploadModalProps) {
  const [tab, setTab] = useState<TabMode>(initialFile ? "upload" : "upload");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [preview, setPreview] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate preview when file changes
  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setTab("upload");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []);

  // Initialize preview for initialFile
  useState(() => {
    if (initialFile && initialFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(initialFile);
    }
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (uploading) return;
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    [uploading, handleFileSelect]
  );

  const completeEndpoint =
    userRole === "ADMIN"
      ? `/api/projects/${projectId}/upload-complete`
      : `/api/projects/${projectId}/inspiration`;

  async function handleUpload() {
    setError(null);

    if (tab === "url") {
      // URL shortcut — upload server-side (no XHR to Drive)
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
            notes: notes.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to add URL" }));
          throw new Error(data.error);
        }

        // Success
        setUrlInput("");
        setNotes("");
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add URL");
      } finally {
        setUploading(false);
      }
    } else {
      // File upload — 3-step resumable upload
      if (!file) return;

      setUploading(true);
      try {
        await uploadFile(file, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    }
  }

  async function uploadFile(fileToUpload: File, displayName: string) {
    setProgress(0);
    setError(null);

    // Chunked upload to Google Drive with automatic retry
    const { driveFileId, size } = await chunkedUpload({
      file: fileToUpload,
      projectId,
      onProgress: (percent) => setProgress(percent),
      onRetry: (attempt, max) =>
        setError(`Retrying upload (attempt ${attempt}/${max})…`),
    });

    setError(null);

    // Register in DB via existing endpoint
    const completeRes = await fetch(completeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId,
        fileName: fileToUpload.name,
        mimeType: fileToUpload.type || "application/octet-stream",
        size,
        category: "DESIGN_INSPIRATION",
        displayName: displayName !== fileToUpload.name ? displayName : null,
        notes: notes.trim() || null,
      }),
    });

    if (!completeRes.ok) {
      const data = await completeRes
        .json()
        .catch(() => ({ error: "Failed to register file" }));
      throw new Error(data.error);
    }

    // Success
    setFile(null);
    setPreview(null);
    setUrlInput("");
    setNotes("");
    setProgress(0);
    onSuccess();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#12141f] border border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-lg font-semibold text-slate-100">Add Inspiration</h3>
          <button
            onClick={onClose}
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
              {/* Drop zone / preview */}
              {file && preview ? (
                <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
                  <img src={preview} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    onClick={() => { setFile(null); setPreview(null); }}
                    disabled={uploading}
                    className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : file ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-white/[0.06] p-2.5">
                    <Upload className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button
                    onClick={() => { setFile(null); setPreview(null); }}
                    disabled={uploading}
                    className="rounded-lg p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
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
                    Drop an image here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Any image or file type</p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = "";
                }}
              />
            </>
          ) : (
            <>
              {/* URL input */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Website URL</label>
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

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Add a note <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What do you like about this?"
              disabled={uploading}
              rows={2}
              className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none disabled:opacity-50"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
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
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || (tab === "upload" ? !file : !urlInput.trim())}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-pink-600 px-5 py-2.5 text-sm font-medium text-white hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Add to Mood Board
          </button>
        </div>
      </div>
    </div>
  );
}
