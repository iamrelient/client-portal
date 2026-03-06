"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, FileX, Loader2, Archive, Columns, Eye, Star } from "lucide-react";
import { ProjectDetailSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { formatRelativeDate } from "@/lib/format-date";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { canPreview3D } from "@/lib/model-utils";
import { StatusTimeline } from "@/components/status-timeline";
import { FileComparisonModal } from "@/components/file-comparison-modal";
import { DownloadOptionsModal } from "@/components/download-options-modal";
import { InspirationBoard } from "@/components/inspiration-board";

type FileCategory = "RENDER" | "DRAWING" | "CAD_DRAWING" | "SUPPORTING" | "DESIGN_INSPIRATION" | "OTHER";

const CATEGORY_ORDER: FileCategory[] = ["RENDER", "DRAWING", "CAD_DRAWING", "SUPPORTING", "DESIGN_INSPIRATION", "OTHER"];
const CATEGORY_LABELS: Record<FileCategory, string> = {
  RENDER: "Renders",
  DRAWING: "Drawings",
  CAD_DRAWING: "CAD Drawings",
  SUPPORTING: "Owner Provided",
  DESIGN_INSPIRATION: "Design Inspirations",
  OTHER: "Others",
};

interface ProjectFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  displayName: string | null;
  notes: string | null;
  thumbnailUrl: string | null;
  isCurrent: boolean;
  version: number;
  fileGroupId: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; role: string };
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

function isUrlShortcut(fileName: string) {
  return fileName.toLowerCase().endsWith(".url");
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

/** Renders first page of a PDF as a canvas thumbnail */
function PdfThumbnail({ fileId, alt }: { fileId: string; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  const render = useCallback(async () => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

      const pdf = await pdfjsLib.getDocument(`/api/files/${fileId}/download?inline=true`).promise;
      const page = await pdf.getPage(1);

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Render at 2x for sharpness, capped at reasonable size
      const targetWidth = 768; // 384px card × 2
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

const CATEGORY_ACCENT: Record<FileCategory, string> = {
  RENDER: "from-brand-500/80 to-brand-600/80",
  DRAWING: "from-amber-500/80 to-amber-600/80",
  CAD_DRAWING: "from-violet-500/80 to-violet-600/80",
  SUPPORTING: "from-cyan-500/80 to-cyan-600/80",
  DESIGN_INSPIRATION: "from-pink-500/80 to-pink-600/80",
  OTHER: "from-slate-500/80 to-slate-600/80",
};

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
    CAD_DRAWING: [],
    SUPPORTING: [],
    DESIGN_INSPIRATION: [],
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
  const projectId = (params.params as string[])[0];

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<Record<string, ProjectFile[]>>({});
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
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

  async function handleDownloadAll(categories?: FileCategory[], includeOldVersions?: boolean) {
    setShowDownloadModal(false);
    setDownloadingZip(true);
    try {
      const params = new URLSearchParams();
      if (categories && categories.length > 0) {
        params.set("categories", categories.join(","));
      }
      if (includeOldVersions) {
        params.set("includeOldVersions", "true");
      }
      const qs = params.toString();
      const res = await fetch(`/api/projects/${projectId}/download-all${qs ? `?${qs}` : ""}`);
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
  const featuredFiles = (() => {
    const currentFiles = project.files.filter((f) => f.isCurrent);
    const groups = new Map<string, ProjectFile>();
    for (const file of currentFiles) {
      const key = file.fileGroupId || file.id;
      const existing = groups.get(key);
      if (!existing || file.version > existing.version) {
        groups.set(key, file);
      }
    }
    return Array.from(groups.values());
  })();

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
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-4 py-3 font-medium text-slate-400">File</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Size</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {items.map(({ latest, versionCount }) => {
                  const FileIcon = getFileIcon(latest.mimeType, latest.originalName);
                  const fileName = latest.displayName || latest.originalName;
                  const previewable = canPreview(latest.mimeType, latest.originalName);

                  return (
                    <>
                      <tr
                        key={latest.id}
                        onClick={() => {
                          if (isUrlShortcut(latest.originalName)) {
                            window.open(`/api/files/${latest.id}/download`, "_blank");
                          } else if (previewable) {
                            setPreviewFile(latest);
                          }
                        }}
                        className={`transition-colors ${
                          previewable || isUrlShortcut(latest.originalName) ? "cursor-pointer" : ""
                        } ${
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
                                  onClick={(e) => { e.stopPropagation(); toggleVersionHistory(latest.id, latest.fileGroupId); }}
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
                                  onClick={(e) => { e.stopPropagation(); handleCompare(latest.id, latest.fileGroupId); }}
                                  className="inline-flex items-center gap-0.5 text-xs text-brand-400 hover:text-brand-300"
                                >
                                  <Columns className="h-3.5 w-3.5" />
                                  Compare
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-400 truncate">{formatSize(latest.size)}</td>
                        <td className="px-4 py-4 text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <FileIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <span className="truncate">{getFileLabel(latest.mimeType, latest.originalName)}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-400 truncate">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={`/api/files/${latest.id}/download`}
                            target={isUrlShortcut(latest.originalName) ? "_blank" : undefined}
                            rel={isUrlShortcut(latest.originalName) ? "noopener noreferrer" : undefined}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-slate-100"
                          >
                            <Download className="h-4 w-4" />
                            {isUrlShortcut(latest.originalName) ? "Open Link" : "Download"}
                          </a>
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
                                        className="text-xs font-medium text-brand-400 hover:text-brand-300"
                                      >
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
      <PageHeader title={project.name} />

      {/* Status Timeline */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <StatusTimeline status={project.status} />
      </div>

      {/* Featured Deliverables */}
      {featuredFiles.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Star className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Featured Deliverables
              </h2>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-400">
                {featuredFiles.length}
              </span>
            </div>
            <button
              onClick={() => setShowDownloadModal(true)}
              disabled={downloadingZip}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-3.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
            >
              {downloadingZip ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Download All (.zip)
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {featuredFiles.map((file) => {
              const FileIcon = getFileIcon(file.mimeType, file.originalName);
              const fileName = file.displayName || file.originalName;
              const previewable = canPreview(file.mimeType, file.originalName);
              const accent = CATEGORY_ACCENT[file.category] || CATEGORY_ACCENT.OTHER;

              return (
                <div
                  key={file.id}
                  onClick={() => previewable ? setPreviewFile(file) : undefined}
                  className={`group relative w-96 flex-shrink-0 snap-start overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-lg hover:shadow-black/20 ${
                    previewable ? "cursor-pointer" : ""
                  }`}
                >
                  {isImage(file.mimeType) || file.mimeType === "application/pdf" ? (
                    /* ── Visual Card (Image or PDF thumbnail) ── */
                    <div className="relative aspect-[4/3]">
                      {/* Thumbnail */}
                      {isImage(file.mimeType) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${file.id}/download?inline=true`}
                          alt={fileName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          {/* PDF first-page render */}
                          <div className="absolute inset-0 bg-white">
                            <PdfThumbnail fileId={file.id} alt={fileName} />
                          </div>
                          {/* Fallback icon while PDF loads */}
                          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
                            <FileIcon className="h-12 w-12 text-slate-600" />
                          </div>
                        </>
                      )}
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Category pill – top left */}
                      <div className="absolute left-3 top-3">
                        <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm`}>
                          {CATEGORY_LABELS[file.category]}
                        </span>
                      </div>

                      {/* Bottom info bar */}
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <p className="truncate text-sm font-medium text-white">
                          {fileName}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs text-white/60">
                            {formatSize(file.size)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.15] px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-white/[0.25]">
                            <Eye className="h-3 w-3" />
                            View
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Document Card (CAD, etc.) ── */
                    <div className="relative aspect-[4/3] flex flex-col">
                      {/* Colored accent strip */}
                      <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />

                      {/* Category pill – top left */}
                      <div className="absolute left-3 top-4">
                        <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm`}>
                          {CATEGORY_LABELS[file.category]}
                        </span>
                      </div>

                      {/* Center icon */}
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
                        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                          <FileIcon className="h-10 w-10 text-slate-300" />
                        </div>
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          {getFileLabel(file.mimeType, file.originalName)}
                        </span>
                      </div>

                      {/* Bottom info bar */}
                      <div className="border-t border-white/[0.06] px-4 py-3">
                        <p className="truncate text-sm font-medium text-slate-200">
                          {fileName}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs text-slate-500">
                            {formatSize(file.size)}
                          </span>
                          {previewable ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors group-hover:bg-white/[0.1]">
                              <Eye className="h-3 w-3" />
                              View
                            </span>
                          ) : (
                            <a
                              href={`/api/files/${file.id}/download`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.1]"
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Files grouped by category */}
      {project.files.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <EmptyState
            icon={FileX}
            title="No files yet"
            description="Files will appear here once they're uploaded"
          />
        </div>
      ) : (
        <>
          {featuredFiles.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                All Files
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
          )}
          {CATEGORY_ORDER.filter(
            (cat) => categorized[cat].length > 0 || cat === "DESIGN_INSPIRATION"
          ).map((cat) =>
            cat === "DESIGN_INSPIRATION" ? (
              <InspirationBoard
                key={cat}
                files={categorized.DESIGN_INSPIRATION}
                projectId={project.id}
                userRole="USER"
                onRefresh={loadProject}
                onPreview={(f) => setPreviewFile(f as ProjectFile)}
              />
            ) : (
              renderCategorySection(cat)
            )
          )}
        </>
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          files={project.files}
          onNavigate={(f) => setPreviewFile(f as ProjectFile)}
        />
      )}

      {/* Download options modal */}
      {showDownloadModal && project && (
        <DownloadOptionsModal
          categories={CATEGORY_ORDER.map((cat) => {
            const allFiles = project.files.filter((f) => f.category === cat);
            const currentFiles = allFiles.filter((f) => f.isCurrent);
            const oldFiles = allFiles.filter((f) => !f.isCurrent);
            return {
              category: cat,
              count: currentFiles.length,
              hasOldVersions: oldFiles.length > 0,
            };
          })}
          onDownload={handleDownloadAll}
          onClose={() => setShowDownloadModal(false)}
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
