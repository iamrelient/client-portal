"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Download, FileX, Folder as FolderIcon, Loader2, Archive, Columns, Eye, Star } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";

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
  customCategory: string | null;
  displayName: string | null;
  notes: string | null;
  boardType?: "INTERIOR" | "EXTERIOR" | null;
  thumbnailUrl: string | null;
  isCurrent: boolean;
  isOutdated: boolean;
  isPanorama: boolean;
  version: number;
  fileGroupId: string | null;
  folderId: string | null;
  syncedFromDrive?: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string; role: string };
}

interface ProjectFolder {
  id: string;
  name: string;
  category: FileCategory;
  customCategory: string | null;
  sortOrder: number;
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  thumbnailPath: string | null;
  company: string | null;
  companyLogoPath: string | null;
  files: ProjectFile[];
  folders: ProjectFolder[];
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
    mimeType.startsWith("video/") ||
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
    // Outdated files always fall to the bottom
    if (a.latest.isOutdated !== b.latest.isOutdated) {
      return a.latest.isOutdated ? 1 : -1;
    }
    // Current files always come first (among non-outdated)
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
interface GroupedFiles {
  standard: Record<FileCategory, { latest: ProjectFile; versionCount: number }[]>;
  custom: Record<string, { latest: ProjectFile; versionCount: number }[]>;
}

function groupByCategory(files: ProjectFile[]): GroupedFiles {
  const latest = getLatestFiles(files);
  const standard: Record<FileCategory, { latest: ProjectFile; versionCount: number }[]> = {
    RENDER: [],
    DRAWING: [],
    CAD_DRAWING: [],
    SUPPORTING: [],
    DESIGN_INSPIRATION: [],
    OTHER: [],
  };
  const custom: Record<string, { latest: ProjectFile; versionCount: number }[]> = {};

  for (const item of latest) {
    if (item.latest.customCategory) {
      const key = item.latest.customCategory;
      if (!custom[key]) custom[key] = [];
      custom[key].push(item);
    } else {
      const cat = item.latest.category || "OTHER";
      standard[cat].push(item);
    }
  }

  return { standard, custom };
}

export default function ClientProjectDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
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
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [downloadingSelected, setDownloadingSelected] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // Featured carousel scroll state
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    // Delay initial check so images/content can settle
    const timer = setTimeout(updateScrollState, 100);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, project]);

  function scrollCarousel(direction: "left" | "right") {
    carouselRef.current?.scrollBy({
      left: direction === "left" ? -400 : 400,
      behavior: "smooth",
    });
  }

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

  async function handleDownloadAll(
    categories?: FileCategory[],
    customCategories?: string[],
    includeOldVersions?: boolean
  ) {
    setShowDownloadModal(false);
    setDownloadingZip(true);
    try {
      const params = new URLSearchParams();
      if (categories && categories.length > 0) {
        params.set("categories", categories.join(","));
      }
      if (customCategories && customCategories.length > 0) {
        params.set("customCategories", customCategories.join(","));
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

  function toggleFileSelected(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSectionSelected(ids: string[]) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedFileIds(new Set());
  }

  async function handleDownloadSelected() {
    if (selectedFileIds.size === 0) return;
    setDownloadingSelected(true);
    try {
      const qs = new URLSearchParams();
      qs.set("fileIds", Array.from(selectedFileIds).join(","));
      const res = await fetch(`/api/projects/${projectId}/download-all?${qs.toString()}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "project"}_selected_files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSelectedFileIds(new Set());
    } catch {
      // silently fail
    }
    setDownloadingSelected(false);
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
    const currentFiles = project.files.filter(
      (f) => f.isCurrent && !f.isOutdated && f.category !== "DESIGN_INSPIRATION"
    );
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

  function renderCategorySection(category: FileCategory, label?: string, overrideItems?: { latest: ProjectFile; versionCount: number }[]) {
    const items = overrideItems || categorized.standard[category];
    const sectionIds = items.map((i) => i.latest.id);
    const sectionAllSelected =
      sectionIds.length > 0 && sectionIds.every((id) => selectedFileIds.has(id));
    const sectionSomeSelected =
      !sectionAllSelected && sectionIds.some((id) => selectedFileIds.has(id));

    // Split items into loose (no folder) and per-folder buckets.
    const customCategoryName =
      label && label !== CATEGORY_LABELS[category] ? label : null;
    const sectionFolders = (project?.folders || []).filter(
      (f) =>
        f.category === category &&
        (f.customCategory ?? null) === customCategoryName
    );
    const looseItems = items.filter((i) => !i.latest.folderId);
    const folderItemsByFolder = new Map<
      string,
      { latest: ProjectFile; versionCount: number }[]
    >();
    for (const item of items) {
      if (item.latest.folderId) {
        const arr = folderItemsByFolder.get(item.latest.folderId) || [];
        arr.push(item);
        folderItemsByFolder.set(item.latest.folderId, arr);
      }
    }

    // Render a group of file rows (reused for loose items and each folder's items).
    const renderFileRows = (
      groupItems: { latest: ProjectFile; versionCount: number }[]
    ) =>
      groupItems.map(({ latest, versionCount }) => {
        const FileIcon = getFileIcon(latest.mimeType, latest.originalName, { isPanorama: latest.isPanorama });
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
              className={`transition-colors hover:bg-white/[0.03] ${
                previewable || isUrlShortcut(latest.originalName) ? "cursor-pointer" : ""
              } ${selectedFileIds.has(latest.id) ? "bg-brand-500/[0.06]" : ""} ${
                latest.isOutdated ? "opacity-60" : ""
              }`}
            >
              <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedFileIds.has(latest.id)}
                  onChange={() => toggleFileSelected(latest.id)}
                  aria-label={`Select ${fileName}`}
                  className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-800 accent-brand-500"
                />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-100">
                    {fileName}
                  </span>
                  {latest.isOutdated && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                      <Clock className="h-3 w-3" />
                      Outdated
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
                  <span className="truncate">{getFileLabel(latest.mimeType, latest.originalName, { isPanorama: latest.isPanorama })}</span>
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
                <td colSpan={6} className="bg-white/[0.02] px-6 py-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Version History
                    </p>
                    {(versionHistory[latest.id] || []).map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between rounded-lg px-4 py-2 border border-white/[0.06] ${
                          selectedFileIds.has(v.id) ? "bg-brand-500/[0.08]" : "bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedFileIds.has(v.id)}
                            onChange={() => toggleFileSelected(v.id)}
                            aria-label={`Select version ${v.version}`}
                            className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-800 accent-brand-500"
                          />
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
      });

    return (
      <div key={label || category} className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">
          {label || CATEGORY_LABELS[category]}
        </h2>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <colgroup>
                <col style={{ width: "3rem" }} />
                <col className="w-[40%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={sectionAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = sectionSomeSelected;
                      }}
                      onChange={() => toggleSectionSelected(sectionIds)}
                      aria-label="Select all in section"
                      className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-800 accent-brand-500"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-400">File</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Size</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {renderFileRows(looseItems)}
                {sectionFolders.map((folder) => {
                  const folderItems = folderItemsByFolder.get(folder.id) || [];
                  const isExpanded = expandedFolderIds.has(folder.id);
                  const isEmpty = folderItems.length === 0;
                  return (
                    <>
                      <tr
                        key={`folder-divider-${folder.id}`}
                        onClick={() => !isEmpty && toggleFolderExpanded(folder.id)}
                        className={`bg-white/[0.04] transition-colors ${
                          isEmpty
                            ? ""
                            : "cursor-pointer hover:bg-white/[0.06]"
                        }`}
                      >
                        <td
                          colSpan={6}
                          className="px-4 py-2.5 text-sm font-medium text-slate-200"
                        >
                          <span className="inline-flex items-center gap-2">
                            {isEmpty ? (
                              <span className="inline-block h-4 w-4" />
                            ) : isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            )}
                            <FolderIcon className="h-4 w-4 text-brand-400" />
                            {folder.name}
                            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-normal text-slate-400">
                              {folderItems.length}
                            </span>
                          </span>
                        </td>
                      </tr>
                      {isEmpty ? (
                        <tr key={`folder-empty-${folder.id}`}>
                          <td
                            colSpan={6}
                            className="px-12 py-3 text-xs italic text-slate-500"
                          >
                            Empty folder
                          </td>
                        </tr>
                      ) : isExpanded ? (
                        renderFileRows(folderItems)
                      ) : null}
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
      <PageHeader
        title={project.name}
        logo={project.companyLogoPath ? `/api/projects/${project.id}/company-logo` : undefined}
      />

      {/* Status Timeline */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl">
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
          <div className="relative">
            {/* Left arrow */}
            {canScrollLeft && (
              <button
                onClick={() => scrollCarousel("left")}
                className="absolute -left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-gray-900/80 text-slate-300 backdrop-blur transition-colors hover:bg-gray-800 hover:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}

            {/* Right arrow */}
            {canScrollRight && (
              <button
                onClick={() => scrollCarousel("right")}
                className="absolute -right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-gray-900/80 text-slate-300 backdrop-blur transition-colors hover:bg-gray-800 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}

            <div
              ref={carouselRef}
              className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {featuredFiles.map((file) => {
                const FileIcon = getFileIcon(file.mimeType, file.originalName, { isPanorama: file.isPanorama });
                const fileName = file.displayName || file.originalName;
                const previewable = canPreview(file.mimeType, file.originalName);
                const accent = CATEGORY_ACCENT[file.category] || CATEGORY_ACCENT.OTHER;

                return (
                  <div
                    key={file.id}
                    onClick={() => previewable ? setPreviewFile(file) : undefined}
                    className={`group relative w-[28rem] flex-shrink-0 snap-start overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:border-white/[0.15] hover:shadow-lg hover:shadow-black/20 ${
                      previewable ? "cursor-pointer" : ""
                    }`}
                  >
                    {isImage(file.mimeType) || file.mimeType === "application/pdf" ? (
                      /* ── Visual Card (Image or PDF thumbnail) ── */
                      <div className="relative aspect-video">
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
                            {file.customCategory || CATEGORY_LABELS[file.category]}
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
                      <div className="relative aspect-video flex flex-col">
                        {/* Colored accent strip */}
                        <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />

                        {/* Category pill – top left */}
                        <div className="absolute left-3 top-4">
                          <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm`}>
                            {file.customCategory || CATEGORY_LABELS[file.category]}
                          </span>
                        </div>

                        {/* Center icon */}
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
                          <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                            <FileIcon className="h-10 w-10 text-slate-300" />
                          </div>
                          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                            {getFileLabel(file.mimeType, file.originalName, { isPanorama: file.isPanorama })}
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
            (cat) => cat !== "DESIGN_INSPIRATION" && categorized.standard[cat].length > 0
          ).map((cat) => renderCategorySection(cat))}
          {Object.entries(categorized.custom)
            .sort(([, a], [, b]) => {
              const aMax = Math.max(...a.map((f) => new Date(f.latest.createdAt).getTime()));
              const bMax = Math.max(...b.map((f) => new Date(f.latest.createdAt).getTime()));
              return bMax - aMax;
            })
            .map(([name, items]) =>
              renderCategorySection("OTHER", name, items)
            )}
          {categorized.standard.DESIGN_INSPIRATION.length > 0 && (
            <InspirationBoard
              key="DESIGN_INSPIRATION"
              files={categorized.standard.DESIGN_INSPIRATION}
              projectId={project.id}
              userRole="USER"
              userId={session?.user?.id || ""}
              onRefresh={loadProject}
              onPreview={(f) => setPreviewFile(f as ProjectFile)}
            />
          )}
        </>
      )}

      {previewFile && (() => {
        // Arrow keys / swipe should stay within the same folder+category+
        // customCategory as the file that was clicked, and should only
        // surface the latest version per fileGroupId. The clicked file
        // itself is kept even if it's an old version (user clicked it
        // explicitly from the version-history list).
        const sameScope = project.files.filter(
          (f) =>
            f.category === previewFile.category &&
            (f.customCategory ?? null) === (previewFile.customCategory ?? null) &&
            (f.folderId ?? null) === (previewFile.folderId ?? null) &&
            // Skip outdated files unless the open file is itself outdated
            (!f.isOutdated || f.id === previewFile.id)
        );
        const latestByGroup = new Map<string, ProjectFile>();
        for (const f of sameScope) {
          const key = f.fileGroupId || f.id;
          const existing = latestByGroup.get(key);
          if (!existing || f.version > existing.version) {
            latestByGroup.set(key, f);
          }
        }
        const navFiles = Array.from(latestByGroup.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        // If the open file is an old version, swap it in so the modal knows
        // where in the list it sits — arrows will leave it when navigated.
        if (!navFiles.some((f) => f.id === previewFile.id)) {
          const key = previewFile.fileGroupId || previewFile.id;
          const idx = navFiles.findIndex((f) => (f.fileGroupId || f.id) === key);
          if (idx >= 0) navFiles[idx] = previewFile;
          else navFiles.push(previewFile);
        }
        return (
          <FilePreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            files={navFiles}
            onNavigate={(f) => setPreviewFile(f as ProjectFile)}
          />
        );
      })()}

      {/* Download options modal */}
      {showDownloadModal && project && (
        <DownloadOptionsModal
          categories={CATEGORY_ORDER.map((cat) => {
            const groups = categorized.standard[cat];
            return {
              category: cat,
              count: groups.length,
              hasOldVersions: groups.some((g) => g.versionCount > 1),
            };
          })}
          customCategories={Object.keys(categorized.custom).map((name) => {
            const groups = categorized.custom[name];
            return {
              name,
              count: groups.length,
              hasOldVersions: groups.some((g) => g.versionCount > 1),
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

      {/* Floating "Download Selected" action bar */}
      {selectedFileIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-gray-900/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <span className="px-2 text-sm font-medium text-slate-200">
              {selectedFileIds.size} {selectedFileIds.size === 1 ? "file" : "files"} selected
            </span>
            <button
              onClick={clearSelection}
              className="rounded-full px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
            >
              Clear
            </button>
            <button
              onClick={handleDownloadSelected}
              disabled={downloadingSelected}
              className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {downloadingSelected ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download Selected (.zip)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
