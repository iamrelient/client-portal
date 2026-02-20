"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, Eye, FileX, Loader2, Archive, Columns } from "lucide-react";
import { ProjectDetailSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { formatRelativeDate } from "@/lib/format-date";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { canPreview3D } from "@/lib/model-utils";
import { StatusTimeline } from "@/components/status-timeline";
import { FileComparisonModal } from "@/components/file-comparison-modal";

type FileCategory = "RENDER" | "DRAWING" | "OTHER";

const CATEGORY_ORDER: FileCategory[] = ["RENDER", "DRAWING", "OTHER"];
const CATEGORY_LABELS: Record<FileCategory, string> = {
  RENDER: "Renders",
  DRAWING: "Drawings",
  OTHER: "Others",
};

interface ProjectFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  displayName: string | null;
  isCurrent: boolean;
  version: number;
  fileGroupId: string | null;
  createdAt: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  thumbnailPath: string | null;
  company: string | null;
  companyLogoPath: string | null;
  files: ProjectFile[];
  createdAt: string;
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

/** Group files so only the latest version of each name shows in the main table */
function getLatestFiles(files: ProjectFile[]) {
  const groups = new Map<string, ProjectFile[]>();

  for (const file of files) {
    const key = file.fileGroupId || file.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }

  const result: { latest: ProjectFile; versionCount: number }[] = [];
  for (const group of Array.from(groups.values())) {
    group.sort((a, b) => b.version - a.version);
    result.push({ latest: group[0], versionCount: group.length });
  }

  result.sort((a, b) => {
    // Current files always come first
    if (a.latest.isCurrent !== b.latest.isCurrent) {
      return a.latest.isCurrent ? -1 : 1;
    }
    return (
      new Date(b.latest.createdAt).getTime() -
      new Date(a.latest.createdAt).getTime()
    );
  });

  return result;
}

/** Group latest files by category */
function groupByCategory(files: ProjectFile[]) {
  const latest = getLatestFiles(files);
  const grouped: Record<FileCategory, { latest: ProjectFile; versionCount: number }[]> = {
    RENDER: [],
    DRAWING: [],
    OTHER: [],
  };

  for (const item of latest) {
    const cat = item.latest.category || "OTHER";
    grouped[cat].push(item);
  }

  return grouped;
}

export default function ClientProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<Record<string, ProjectFile[]>>({});
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [compareTarget, setCompareTarget] = useState<string | null>(null);

  function loadProject() {
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (res.status === 403) {
          setError("You don't have access to this project");
          setLoading(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setProject(data);
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Something went wrong");
        setLoading(false);
      });
  }

  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Trigger auto-sync on mount
  useEffect(() => {
    if (project?.id) {
      fetch(`/api/projects/${projectId}/sync`, { method: "POST" })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.changed) loadProject();
          }
        })
        .catch(() => {});
    }
  }, [project?.id]);

  async function toggleVersionHistory(fileId: string, fileGroupId: string | null) {
    if (expandedGroup === fileId) {
      setExpandedGroup(null);
      return;
    }

    setExpandedGroup(fileId);

    if (!fileGroupId || versionHistory[fileId]) return;

    try {
      const res = await fetch(`/api/files/${fileId}/versions`);
      if (res.ok) {
        const versions = await res.json();
        setVersionHistory((prev) => ({ ...prev, [fileId]: versions }));
      }
    } catch {
      // ignore
    }
  }

  async function handleDownloadAll() {
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/download-all`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "project"}_files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
    setDownloadingZip(false);
  }

  async function handleCompare(fileId: string, fileGroupId: string | null) {
    // Ensure version history is loaded
    if (fileGroupId && !versionHistory[fileId]) {
      try {
        const res = await fetch(`/api/files/${fileId}/versions`);
        if (res.ok) {
          const versions = await res.json();
          setVersionHistory((prev) => ({ ...prev, [fileId]: versions }));
        }
      } catch {
        // ignore
      }
    }
    setCompareTarget(fileId);
  }

  if (loading) {
    return <ProjectDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400">
        Project not found
      </div>
    );
  }

  const categorized = groupByCategory(project.files);

  function renderCategorySection(category: FileCategory) {
    const items = categorized[category];

    return (
      <div key={category} className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">
          {CATEGORY_LABELS[category]}
        </h2>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-6 py-3 font-medium text-slate-400">File</th>
                  <th className="px-6 py-3 font-medium text-slate-400">Size</th>
                  <th className="px-6 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-6 py-3 font-medium text-slate-400">Date</th>
                  <th className="px-6 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {items.map(({ latest, versionCount }) => {
                  const FileIcon = getFileIcon(latest.mimeType, latest.originalName);
                  const fileName = latest.displayName || latest.originalName;

                  return (
                    <>
                      <tr
                        key={latest.id}
                        className={`transition-colors ${
                          latest.isCurrent
                            ? "bg-green-500/[0.06] hover:bg-green-500/10"
                            : "hover:bg-white/[0.03]"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">
                              {fileName}
                            </span>
                            {latest.isCurrent && (
                              <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                Current
                              </span>
                            )}
                            {latest.version > 1 && (
                              <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-400">
                                v{latest.version}
                              </span>
                            )}
                            {versionCount > 1 && (
                              <>
                                <button
                                  onClick={() => toggleVersionHistory(latest.id, latest.fileGroupId)}
                                  className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-brand-600"
                                >
                                  {expandedGroup === latest.id ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                  {versionCount} versions
                                </button>
                                <button
                                  onClick={() => handleCompare(latest.id, latest.fileGroupId)}
                                  className="inline-flex items-center gap-0.5 text-xs text-brand-400 hover:text-brand-300"
                                >
                                  <Columns className="h-3.5 w-3.5" />
                                  Compare
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-400">{formatSize(latest.size)}</td>
                        <td className="px-6 py-4 text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <FileIcon className="h-4 w-4 text-slate-400" />
                            {getFileLabel(latest.mimeType, latest.originalName)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {canPreview(latest.mimeType, latest.originalName) && (
                              <button
                                onClick={() => setPreviewFile(latest)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-300"
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                            )}
                            <a
                              href={`/api/files/${latest.id}/download`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </a>
                          </div>
                        </td>
                      </tr>
                      {/* Version history expansion */}
                      {expandedGroup === latest.id && versionCount > 1 && (
                        <tr key={`${latest.id}-versions`}>
                          <td colSpan={5} className="bg-white/[0.02] px-6 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                Version History
                              </p>
                              {(versionHistory[latest.id] || []).map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-2 border border-white/[0.06]"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-400">
                                      v{v.version}
                                    </span>
                                    <span className="text-sm text-slate-300">
                                      {formatSize(v.size)}
                                    </span>
                                    <span className="text-sm text-slate-400">
                                      {formatRelativeDate(v.createdAt)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {canPreview(v.mimeType, v.originalName || latest.originalName) && (
                                      <button
                                        onClick={() => setPreviewFile(v as ProjectFile)}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        View
                                      </button>
                                    )}
                                    <a
                                      href={`/api/files/${v.id}/download`}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-100"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      Download
                                    </a>
                                  </div>
                                </div>
                              ))}
                              {!versionHistory[latest.id] && (
                                <div className="flex justify-center py-2">
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Company branding header */}
      {project.company && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-sm">
          {project.companyLogoPath ? (
            <img
              src={`/api/projects/${projectId}/company-logo?v=${encodeURIComponent(project.companyLogoPath!)}`}
              alt={project.company}
              className="h-14 w-auto object-contain"
            />
          ) : (
            <p className="text-lg font-semibold text-slate-100">{project.company}</p>
          )}
        </div>
      )}

      <PageHeader title={project.name} />

      {/* Status Timeline */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <StatusTimeline status={project.status} />
      </div>

      {/* Download All */}
      {project.files.some((f) => f.isCurrent) && (
        <div className="mb-6">
          <button
            onClick={handleDownloadAll}
            disabled={downloadingZip}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
          >
            {downloadingZip ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Download All Files (.zip)
          </button>
        </div>
      )}

      {/* Files grouped by category */}
      {project.files.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <EmptyState
            icon={FileX}
            title="No files yet"
            description="Files will appear here once they're uploaded"
          />
        </div>
      ) : (
        CATEGORY_ORDER.filter((cat) => categorized[cat].length > 0).map((cat) =>
          renderCategorySection(cat)
        )
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          files={project.files}
          onNavigate={(f) => setPreviewFile(f as ProjectFile)}
        />
      )}

      {compareTarget && versionHistory[compareTarget] && (
        <FileComparisonModal
          versions={versionHistory[compareTarget]}
          onClose={() => setCompareTarget(null)}
        />
      )}
    </div>
  );
}
