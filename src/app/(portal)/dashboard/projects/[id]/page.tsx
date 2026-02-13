"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, Eye, FileX } from "lucide-react";
import { ProjectDetailSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { formatRelativeDate } from "@/lib/format-date";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { canPreview3D } from "@/lib/model-utils";

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

  result.sort(
    (a, b) =>
      new Date(b.latest.createdAt).getTime() -
      new Date(a.latest.createdAt).getTime()
  );

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

  if (loading) {
    return <ProjectDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-500">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-500">
        Project not found
      </div>
    );
  }

  const categorized = groupByCategory(project.files);

  function renderCategorySection(category: FileCategory) {
    const items = categorized[category];

    return (
      <div key={category} className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {CATEGORY_LABELS[category]}
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 font-medium text-slate-500">File</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Type</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map(({ latest, versionCount }) => {
                  const FileIcon = getFileIcon(latest.mimeType, latest.originalName);
                  const fileName = latest.displayName || latest.originalName;

                  return (
                    <>
                      <tr
                        key={latest.id}
                        className={`transition-colors ${
                          latest.isCurrent
                            ? "bg-green-50/60 hover:bg-green-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {fileName}
                            </span>
                            {latest.isCurrent && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                Current
                              </span>
                            )}
                            {latest.version > 1 && (
                              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                                v{latest.version}
                              </span>
                            )}
                            {versionCount > 1 && (
                              <button
                                onClick={() => toggleVersionHistory(latest.id, latest.fileGroupId)}
                                className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:text-brand-600"
                              >
                                {expandedGroup === latest.id ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {versionCount} versions
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{formatSize(latest.size)}</td>
                        <td className="px-6 py-4 text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <FileIcon className="h-4 w-4 text-slate-400" />
                            {getFileLabel(latest.mimeType, latest.originalName)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {canPreview(latest.mimeType, latest.originalName) && (
                              <button
                                onClick={() => setPreviewFile(latest)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500"
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                            )}
                            <a
                              href={`/api/files/${latest.id}/download`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
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
                          <td colSpan={5} className="bg-slate-50 px-6 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                                Version History
                              </p>
                              {(versionHistory[latest.id] || []).map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-center justify-between rounded-lg bg-white px-4 py-2 border border-slate-100"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                      v{v.version}
                                    </span>
                                    <span className="text-sm text-slate-700">
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
                                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500"
                                      >
                                        <Eye className="h-3.5 w-3.5" />
                                        View
                                      </button>
                                    )}
                                    <a
                                      href={`/api/files/${v.id}/download`}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
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
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {project.companyLogoPath ? (
            <img
              src={`/api/projects/${projectId}/company-logo`}
              alt={project.company}
              className="h-14 w-auto object-contain"
            />
          ) : (
            <p className="text-lg font-semibold text-slate-900">{project.company}</p>
          )}
        </div>
      )}

      <PageHeader title={project.name} />

      {/* Files grouped by category */}
      {project.files.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
        />
      )}
    </div>
  );
}
