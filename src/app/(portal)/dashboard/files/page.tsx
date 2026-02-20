"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Download, Eye, FileX } from "lucide-react";
import Link from "next/link";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FilePreviewModal } from "@/components/file-preview-modal";
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
  project: { id: string; name: string } | null;
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

export default function DashboardFilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);

  useEffect(() => {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Files" description="Loading..." />
        <TableSkeleton rows={5} cols={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Files"
        description={`${files.length} file${files.length !== 1 ? "s" : ""} available`}
      />

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-3 font-medium text-slate-400">File</th>
                <th className="px-6 py-3 font-medium text-slate-400">Project</th>
                <th className="px-6 py-3 font-medium text-slate-400">Size</th>
                <th className="px-6 py-3 font-medium text-slate-400">Type</th>
                <th className="px-6 py-3 font-medium text-slate-400">Date</th>
                <th className="px-6 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {files.map((file) => {
                const FileIcon = getFileIcon(file.mimeType, file.originalName);
                return (
                  <tr key={file.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-100">
                      {file.originalName}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {file.project ? (
                        <Link
                          href={`/dashboard/projects/${file.project.id}`}
                          className="text-brand-400 hover:text-brand-300 transition-colors"
                        >
                          {file.project.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {formatSize(file.size)}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <FileIcon className="h-4 w-4 text-slate-400" />
                        {getFileLabel(file.mimeType, file.originalName)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {formatRelativeDate(file.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {canPreview(file.mimeType, file.originalName) && (
                          <button
                            onClick={() => setPreviewFile(file)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>
                        )}
                        <a
                          href={`/api/files/${file.id}/download`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-400 hover:text-slate-100 transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {files.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={FileX}
                      title="No files available"
                      description="Files from your projects will appear here"
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
          files={files}
          onNavigate={(f) => setPreviewFile(f as FileRow)}
        />
      )}
    </div>
  );
}
