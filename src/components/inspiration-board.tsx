"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Plus,
  Globe,
  Trash2,
  ExternalLink,
  Eye,
  Pencil,
  MessageCircle,
  X,
  Loader2,
} from "lucide-react";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { InspirationUploadModal } from "./inspiration-upload-modal";
import { ConfirmModal } from "./confirm-modal";

// ── Uploader badge colors ──
const UPLOADER_COLORS = [
  "bg-blue-500/80",
  "bg-emerald-500/80",
  "bg-amber-500/80",
  "bg-violet-500/80",
  "bg-rose-500/80",
  "bg-cyan-500/80",
  "bg-orange-500/80",
  "bg-teal-500/80",
  "bg-fuchsia-500/80",
  "bg-lime-500/80",
];

function getUploaderColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return UPLOADER_COLORS[Math.abs(hash) % UPLOADER_COLORS.length];
}

function getFirstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

// ── Types ──
interface InspirationFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  category: string;
  displayName: string | null;
  notes: string | null;
  boardType?: "INTERIOR" | "EXTERIOR" | null;
  thumbnailUrl: string | null;
  isCurrent: boolean;
  version: number;
  fileGroupId: string | null;
  syncedFromDrive?: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string; role: string };
}

interface InspirationBoardProps {
  files: { latest: InspirationFile; versionCount: number }[];
  projectId: string;
  userRole: "ADMIN" | "USER";
  userId: string;
  onRefresh: () => void;
  onPreview?: (file: InspirationFile) => void;
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

function isUrlShortcut(fileName: string) {
  return fileName.toLowerCase().endsWith(".url");
}

function getDomain(fileName: string) {
  return fileName.replace(/\.url$/i, "");
}

/** Renders first page of a PDF as a canvas thumbnail */
function PdfThumbnail({ fileId, alt }: { fileId: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  const render = useCallback(async () => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const pdf = await pdfjsLib.getDocument(
        `/api/files/${fileId}/download?inline=true`
      ).promise;
      const page = await pdf.getPage(1);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const targetWidth = 512;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
      setLoaded(true);
    } catch {
      // PDF failed to render — fallback stays visible
    }
  }, [fileId]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={alt}
      className={`h-full w-full object-cover transition-opacity duration-300 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      style={{ display: "block" }}
    />
  );
}

export function InspirationBoard({
  files,
  projectId,
  userRole,
  userId,
  onRefresh,
  onPreview,
}: InspirationBoardProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [dropBoardType, setDropBoardType] = useState<"INTERIOR" | "EXTERIOR" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<InspirationFile | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBoardType, setEditBoardType] = useState<"INTERIOR" | "EXTERIOR" | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = userRole === "ADMIN";

  const canEdit = (file: InspirationFile) =>
    isAdmin || file.uploadedBy.id === userId;

  const canDelete = (file: InspirationFile) =>
    isAdmin || file.uploadedBy.id === userId;

  const handleAddCardDrop = useCallback(
    (e: React.DragEvent, boardType: "INTERIOR" | "EXTERIOR") => {
      e.preventDefault();
      setDragOverSection(null);
      const fileList = Array.from(e.dataTransfer.files);
      if (fileList.length > 0) {
        setDroppedFiles(fileList);
        setDropBoardType(boardType);
        setShowUploadModal(true);
      }
    },
    []
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/files/${deleteTarget}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onRefresh();
      }
    } catch {
      // silent
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleOpenEdit = (file: InspirationFile) => {
    setEditTarget(file);
    setEditName(file.displayName || file.originalName);
    setEditNotes(file.notes || "");
    setEditBoardType(file.boardType || null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/files/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editName.trim() || null,
          notes: editNotes.trim() || null,
          boardType: editBoardType,
        }),
      });
      if (res.ok) {
        onRefresh();
        setEditTarget(null);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleCardClick = (file: InspirationFile) => {
    if (isUrlShortcut(file.originalName)) {
      window.open(`/api/files/${file.id}/download`, "_blank");
    } else if (
      (isImage(file.mimeType) || isPdf(file.mimeType)) &&
      onPreview
    ) {
      onPreview(file);
    }
  };

  // ── Sort & group files ──
  const sortedFiles = [...files].sort((a, b) => {
    const aIsUrl = isUrlShortcut(a.latest.originalName);
    const bIsUrl = isUrlShortcut(b.latest.originalName);
    if (aIsUrl !== bIsUrl) return aIsUrl ? 1 : -1;
    return 0;
  });

  const interiorFiles = sortedFiles.filter(
    (f) => f.latest.boardType === "INTERIOR"
  );
  const exteriorFiles = sortedFiles.filter(
    (f) => f.latest.boardType === "EXTERIOR"
  );
  const uncategorizedFiles = sortedFiles.filter((f) => !f.latest.boardType);

  // ── Render helpers ──
  function renderAddCard(boardType: "INTERIOR" | "EXTERIOR") {
    const isDragOver = dragOverSection === boardType;
    return (
      <button
        onClick={() => {
          setDroppedFiles([]);
          setDropBoardType(boardType);
          setShowUploadModal(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverSection(boardType);
        }}
        onDragLeave={() => setDragOverSection(null)}
        onDrop={(e) => handleAddCardDrop(e, boardType)}
        className={`group relative aspect-square rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-3 p-4 text-center ${
          isDragOver
            ? "border-pink-500 bg-pink-500/10 scale-[1.02]"
            : "border-white/[0.12] hover:border-pink-500/40 hover:bg-pink-500/[0.03]"
        }`}
      >
        <div
          className={`rounded-full p-3 transition-colors ${
            isDragOver
              ? "bg-pink-500/20"
              : "bg-white/[0.04] group-hover:bg-pink-500/10"
          }`}
        >
          <Plus
            className={`h-6 w-6 transition-colors ${
              isDragOver
                ? "text-pink-400"
                : "text-slate-400 group-hover:text-pink-400"
            }`}
          />
        </div>
        <div>
          <p
            className={`text-sm font-medium transition-colors ${
              isDragOver ? "text-pink-300" : "text-slate-300"
            }`}
          >
            Share Your Ideas
          </p>
          <p className="mt-1 text-[11px] text-slate-500 leading-tight">
            Drag & drop images
            <br />
            or paste a URL
          </p>
        </div>
      </button>
    );
  }

  function renderFileCard(file: InspirationFile) {
    const isUrl = isUrlShortcut(file.originalName);
    const isImg = isImage(file.mimeType);
    const isPdfFile = isPdf(file.mimeType);
    const fileName = file.displayName || file.originalName;
    const hasEdit = canEdit(file);
    const hasDelete = canDelete(file);
    const hasActions = hasEdit || hasDelete || file.notes;
    const isClickable = isImg || isUrl || isPdfFile;

    return (
      <div
        key={file.id}
        onClick={() => handleCardClick(file)}
        className={`group relative aspect-square rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all duration-200 hover:border-white/[0.15] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 ${
          isClickable ? "cursor-pointer" : ""
        }`}
      >
        {/* ── Image Card ── */}
        {isImg ? (
          <>
            <img
              src={`/api/files/${file.id}/download?inline=true`}
              alt={fileName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <Eye className="h-3.5 w-3.5" />
                View
              </span>
            </div>
          </>
        ) : isPdfFile ? (
          <>
            <div className="absolute inset-0 bg-white">
              <PdfThumbnail fileId={file.id} alt={fileName} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {(() => {
                const FileIcon = getFileIcon(file.mimeType, file.originalName);
                return <FileIcon className="h-10 w-10 text-slate-300/30" />;
              })()}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <Eye className="h-3.5 w-3.5" />
                View
              </span>
            </div>
          </>
        ) : isUrl ? (
          <>
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <div className="rounded-2xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 p-4 ring-1 ring-white/[0.08]">
                <Globe className="h-8 w-8 text-pink-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-200 truncate max-w-full">
                  {getDomain(file.originalName)}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">Website</p>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.15] px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <ExternalLink className="h-3.5 w-3.5" />
                Open Link
              </span>
            </div>
          </>
        ) : (
          <>
            {(() => {
              const FileIcon = getFileIcon(file.mimeType, file.originalName);
              const label = getFileLabel(file.mimeType, file.originalName);
              return (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
                  <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                    <FileIcon className="h-8 w-8 text-slate-300" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-200 truncate max-w-full">
                      {fileName}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500 uppercase tracking-wider">
                      {label}
                    </p>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── Uploader Name Badge (always visible, top-right) ── */}
        <div className="absolute top-2 right-2 z-10">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm text-white ${getUploaderColor(file.uploadedBy.id)}`}
          >
            {getFirstName(file.uploadedBy.name)}
          </span>
        </div>

        {/* ── Persistent notes indicator (always visible, top-left) ── */}
        {file.notes && (
          <div className="absolute top-2 left-2 z-10">
            <div className="rounded-full bg-black/50 p-1.5 backdrop-blur-sm shadow-sm">
              <MessageCircle className="h-3 w-3 text-white/80" />
            </div>
          </div>
        )}

        {/* ── Hover overlay: gradient + notes + action buttons ── */}
        {hasActions && (
          <>
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

            {file.notes && (
              <div className="absolute inset-x-0 bottom-0 px-3 pb-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                <p className="text-[11px] text-white/90 leading-snug line-clamp-2 break-words">
                  &ldquo;{file.notes}&rdquo;
                </p>
                <p className="text-[9px] text-white/50 mt-0.5">
                  &mdash; {file.uploadedBy.name}
                </p>
              </div>
            )}

            {hasEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEdit(file);
                }}
                className="absolute bottom-2.5 left-2.5 z-20 rounded-full bg-black/60 p-2 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-white/20 hover:text-white transition-all duration-150 backdrop-blur-sm"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}

            {hasDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(file.id);
                }}
                className="absolute bottom-2.5 right-2.5 z-20 rounded-full bg-red-500/70 p-2 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all duration-150 backdrop-blur-sm"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  function renderSection(
    label: string,
    sectionFiles: { latest: InspirationFile; versionCount: number }[],
    boardType: "INTERIOR" | "EXTERIOR"
  ) {
    return (
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {renderAddCard(boardType)}
          {sectionFiles.map(({ latest: file }) => renderFileCard(file))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">
        Design Inspirations
      </h2>

      {/* Interior Section */}
      {renderSection("Interior", interiorFiles, "INTERIOR")}

      {/* Exterior Section */}
      {renderSection("Exterior", exteriorFiles, "EXTERIOR")}

      {/* Uncategorized Section (legacy files with no boardType) */}
      {uncategorizedFiles.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-slate-400 uppercase tracking-wider">
            Uncategorized
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {uncategorizedFiles.map(({ latest: file }) =>
              renderFileCard(file)
            )}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <InspirationUploadModal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setDroppedFiles([]);
          setDropBoardType(null);
        }}
        projectId={projectId}
        userRole={userRole}
        onSuccess={onRefresh}
        initialFiles={droppedFiles}
        defaultBoardType={dropBoardType}
      />

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#12141f] border border-white/[0.08] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold text-slate-100">
                Edit Inspiration
              </h3>
              <button
                onClick={() => setEditTarget(null)}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Display Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:opacity-50"
                />
              </div>

              {/* Board Type */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Board
                </label>
                <div className="flex gap-2">
                  {(["INTERIOR", "EXTERIOR"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEditBoardType(type)}
                      disabled={saving}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        editBoardType === type
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
                  Note <span className="text-slate-500">(optional)</span>
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="What do you like about this?"
                  disabled={saving}
                  rows={3}
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none disabled:opacity-50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={() => setEditTarget(null)}
                disabled={saving}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-pink-600 px-5 py-2.5 text-sm font-medium text-white hover:from-pink-600 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Inspiration"
        message="Are you sure you want to remove this inspiration from the mood board?"
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
