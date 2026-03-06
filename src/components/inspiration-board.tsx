"use client";

import { useState, useCallback } from "react";
import {
  Plus,
  Globe,
  Trash2,
  MessageCircle,
  ExternalLink,
  Eye,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { InspirationUploadModal } from "./inspiration-upload-modal";
import { ConfirmModal } from "./confirm-modal";

interface InspirationFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  category: string;
  displayName: string | null;
  notes: string | null;
  thumbnailUrl: string | null;
  isCurrent: boolean;
  version: number;
  fileGroupId: string | null;
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

function isUrlShortcut(fileName: string) {
  return fileName.toLowerCase().endsWith(".url");
}

function getDomain(fileName: string) {
  return fileName.replace(/\.url$/i, "");
}

function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editTarget, setEditTarget] = useState<InspirationFile | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = userRole === "ADMIN";

  const canEdit = (file: InspirationFile) =>
    isAdmin || file.uploadedBy.id === userId;

  const canDelete = (file: InspirationFile) =>
    isAdmin || file.uploadedBy.id === userId;

  const handleAddCardDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setDroppedFile(file);
      setShowUploadModal(true);
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/files/${deleteTarget}`, { method: "DELETE" });
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
    } else if (isImage(file.mimeType) && onPreview) {
      onPreview(file);
    }
  };

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-100">
        Design Inspirations
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* ── Add Inspiration Card ── */}
        <button
          onClick={() => {
            setDroppedFile(null);
            setShowUploadModal(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleAddCardDrop}
          className={`group relative aspect-square rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-3 p-4 text-center ${
            dragOver
              ? "border-pink-500 bg-pink-500/10 scale-[1.02]"
              : "border-white/[0.12] hover:border-pink-500/40 hover:bg-pink-500/[0.03]"
          }`}
        >
          <div
            className={`rounded-full p-3 transition-colors ${
              dragOver
                ? "bg-pink-500/20"
                : "bg-white/[0.04] group-hover:bg-pink-500/10"
            }`}
          >
            <Plus
              className={`h-6 w-6 transition-colors ${
                dragOver
                  ? "text-pink-400"
                  : "text-slate-400 group-hover:text-pink-400"
              }`}
            />
          </div>
          <div>
            <p
              className={`text-sm font-medium transition-colors ${
                dragOver ? "text-pink-300" : "text-slate-300"
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

        {/* ── Inspiration Cards (images first, URLs last) ── */}
        {[...files].sort((a, b) => {
          const aIsUrl = isUrlShortcut(a.latest.originalName);
          const bIsUrl = isUrlShortcut(b.latest.originalName);
          if (aIsUrl !== bIsUrl) return aIsUrl ? 1 : -1;
          return 0;
        }).map(({ latest: file }) => {
          const isUrl = isUrlShortcut(file.originalName);
          const isImg = isImage(file.mimeType);
          const fileName = file.displayName || file.originalName;
          const uploaderBadge =
            file.uploadedBy.role === "ADMIN" ? "Studio" : "Client";
          const showEdit = canEdit(file);
          const showDelete = canDelete(file);

          return (
            <div
              key={file.id}
              onClick={() => handleCardClick(file)}
              className={`group relative aspect-square rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all duration-200 hover:border-white/[0.15] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 ${
                isImg || isUrl ? "cursor-pointer" : ""
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
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                  {/* Bottom info (visible on hover) */}
                  <div className="absolute inset-x-0 bottom-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                    <p className="text-xs font-medium text-white truncate">
                      {fileName}
                    </p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      {formatRelativeDate(file.createdAt)}
                    </p>
                  </div>

                  {/* View overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </span>
                  </div>
                </>
              ) : isUrl ? (
                /* ── URL Bookmark Card ── */
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

                  {/* Open link overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.15] px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Link
                    </span>
                  </div>
                </>
              ) : (
                /* ── Generic File Card ── */
                <>
                  {(() => {
                    const FileIcon = getFileIcon(
                      file.mimeType,
                      file.originalName
                    );
                    const label = getFileLabel(
                      file.mimeType,
                      file.originalName
                    );
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

              {/* ── Uploader Badge (always visible) ── */}
              <div className="absolute top-2 right-2 z-10">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-sm ${
                    file.uploadedBy.role === "ADMIN"
                      ? "bg-pink-500/80 text-white"
                      : "bg-blue-500/80 text-white"
                  }`}
                >
                  {uploaderBadge}
                </span>
              </div>

              {/* ── Notes indicator ── */}
              {file.notes && (
                <div className="absolute top-2 left-2 z-10 group/note">
                  <div className="rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                    <MessageCircle className="h-3 w-3 text-white/80" />
                  </div>
                  {/* Notes tooltip */}
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-lg bg-[#1a1d2e] border border-white/[0.1] p-2.5 shadow-xl opacity-0 invisible group-hover/note:opacity-100 group-hover/note:visible transition-all duration-150 z-20">
                    <p className="text-xs text-slate-300 leading-relaxed break-words">
                      &ldquo;{file.notes}&rdquo;
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      &mdash; {file.uploadedBy.name}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Action buttons (visible on hover) ── */}
              <div className="absolute bottom-2 left-2 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {/* Edit button */}
                {showEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(file);
                    }}
                    className="rounded-full bg-black/50 p-1.5 text-white/60 hover:bg-white/20 hover:text-white transition-all duration-150 backdrop-blur-sm"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {/* Delete button */}
                {showDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(file.id);
                    }}
                    className="rounded-full bg-black/50 p-1.5 text-white/60 hover:bg-red-500/80 hover:text-white transition-all duration-150 backdrop-blur-sm"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      <InspirationUploadModal
        open={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setDroppedFile(null);
        }}
        projectId={projectId}
        userRole={userRole}
        onSuccess={onRefresh}
        initialFile={droppedFile}
      />

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-[#12141f] border border-white/[0.08] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold text-slate-100">Edit Inspiration</h3>
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
