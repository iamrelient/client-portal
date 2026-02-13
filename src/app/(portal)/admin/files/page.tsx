"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Download, Eye, Loader2, Trash2, Upload } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmModal } from "@/components/confirm-modal";
import { DropZone } from "@/components/drop-zone";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { canPreview3D } from "@/lib/model-utils";

interface FileRow {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { name: string; email: string };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreview(mimeType: string, fileName: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    canPreview3D(mimeType, fileName)
  );
}

export default function AdminFilesPage() {
  const toast = useToast();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);

  function loadFiles() {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadFiles();
  }, []);

  async function handleUpload(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const sessionRes = await fetch("/api/files/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      });

      if (!sessionRes.ok) {
        const data = await sessionRes.json();
        toast.error(data.error || "Failed to start upload");
        setUploading(false);
        return;
      }

      const { uploadUri } = await sessionRes.json();

      const driveResult = await new Promise<{ id?: string; name?: string; size?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Invalid response from Google Drive"));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadUri);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      if (!driveResult.id) {
        toast.error("Upload succeeded but no file ID returned. Please refresh.");
        setUploading(false);
        return;
      }

      const completeRes = await fetch("/api/files/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFileId: driveResult.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: Number(driveResult.size) || file.size,
        }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        toast.error(data.error || "Failed to register file");
        setUploading(false);
        return;
      }

      setUploading(false);
      setUploadProgress(0);
      toast.success("File uploaded successfully");
      loadFiles();
    } catch {
      toast.error("Upload failed");
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("File deleted");
        loadFiles();
      }
    } catch {
      toast.error("Failed to delete file");
    }
    setDeleting(null);
    setDeleteTarget(null);
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="File Management" description="Loading..." />
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="File Management"
        description={`${files.length} file${files.length !== 1 ? "s" : ""} uploaded`}
      />

      {/* Upload Zone */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Upload a file
        </label>
        <DropZone
          onFiles={handleUpload}
          uploading={uploading}
          progress={uploadProgress}
        />
      </div>

      {/* Files Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">File</th>
                <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                <th className="px-6 py-3 font-medium text-slate-500">Type</th>
                <th className="px-6 py-3 font-medium text-slate-500">Uploaded By</th>
                <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {files.map((file) => {
                const FileIcon = getFileIcon(file.mimeType, file.originalName);
                return (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <a
                        href={`/api/files/${file.id}/download`}
                        className="font-medium text-brand-600 hover:text-brand-500"
                      >
                        {file.originalName}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatSize(file.size)}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <FileIcon className="h-4 w-4 text-slate-400" />
                        {getFileLabel(file.mimeType, file.originalName)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {file.uploadedBy.name}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {formatRelativeDate(file.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {canPreview(file.mimeType, file.originalName) && (
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(file.id)}
                          disabled={deleting === file.id}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {deleting === file.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {files.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Upload}
                      title="No files yet"
                      description="Upload your first file using the drop zone above"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete file"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting !== null}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
