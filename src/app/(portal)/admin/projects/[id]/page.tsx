"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, Eye, FileX, Loader2, Trash2, X, Upload, Archive, Activity, Columns, Star, Unlink } from "lucide-react";
import { ProjectDetailSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmModal } from "@/components/confirm-modal";
import { DropZone } from "@/components/drop-zone";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";
import { getFileIcon, getFileLabel } from "@/lib/file-icons";
import { canPreview3D } from "@/lib/model-utils";
import { compressImage } from "@/lib/compress-image";
import { StatusTimeline } from "@/components/status-timeline";
import { FileComparisonModal } from "@/components/file-comparison-modal";
import { DownloadOptionsModal } from "@/components/download-options-modal";

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
  driveFolderId: string | null;
  authorizedEmails: string[];
  files: ProjectFile[];
  createdBy: { name: string };
  createdAt: string;
}

interface UploadFileEntry {
  file: File;
  category: FileCategory;
  displayName: string;
  targetFileGroupId: string | null;
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

export default function AdminProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<Record<string, ProjectFile[]>>({});
  const [togglingCurrent, setTogglingCurrent] = useState<string | null>(null);
  const [updatingCategory, setUpdatingCategory] = useState<string | null>(null);

  const [downloadingZip, setDownloadingZip] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Upload modal state (supports multiple files)
  const [uploadQueue, setUploadQueue] = useState<UploadFileEntry[] | null>(null);

  // Drag-drop state
  const [dragOverFileId, setDragOverFileId] = useState<string | null>(null);

  // Confirm modal state
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);
  const [showDeleteProject, setShowDeleteProject] = useState(false);

  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editStatus, setEditStatus] = useState("concept");

  const [compareTarget, setCompareTarget] = useState<string | null>(null);

  // Client activity
  const [showActivity, setShowActivity] = useState(false);
  const [activityData, setActivityData] = useState<Array<{
    id: string;
    viewedAt: string;
    user: { name: string; email: string };
    file: { originalName: string; displayName: string | null };
  }> | null>(null);

  function loadProject() {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data);
        setEditName(data.name);
        setEditEmails(data.authorizedEmails?.join(", ") || "");
        setEditCompany(data.company || "");
        setEditStatus(data.status || "concept");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Trigger auto-sync on mount
  useEffect(() => {
    if (project?.driveFolderId) {
      fetch(`/api/projects/${projectId}/sync`, { method: "POST" })
        .then((res) => {
          if (res.ok) loadProject();
        })
        .catch(() => {});
    }
  }, [project?.driveFolderId]);

  async function handleStatusChange(newStatus: string) {
    setEditStatus(newStatus);
    try {
      const fd = new FormData();
      fd.set("name", editName);
      fd.set("emails", editEmails);
      fd.set("company", editCompany);
      fd.set("status", newStatus);
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: fd,
      });
      if (res.ok) {
        toast.success("Status updated");
        loadProject();
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("name", editName);
    formData.set("emails", editEmails);
    formData.set("company", editCompany);
    formData.set("status", editStatus);

    // Compress images before uploading
    const thumbnail = formData.get("thumbnail") as File | null;
    if (thumbnail && thumbnail.size > 0) {
      formData.set("thumbnail", await compressImage(thumbnail));
    }

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      toast.success("Project updated");
      setSaving(false);
      loadProject();
    } catch {
      toast.error("Something went wrong");
      setSaving(false);
    }
  }

  // Called when files are dropped on the DropZone — opens the upload modal
  function handleFilesSelected(fileList: FileList) {
    if (!fileList.length) return;

    const entries: UploadFileEntry[] = Array.from(fileList).map((file) => ({
      file,
      category: "OTHER" as FileCategory,
      displayName: file.name,
      targetFileGroupId: null,
    }));

    setUploadQueue(entries);
  }

  // Called when a file is dropped onto an existing file row (drag-to-iterate)
  function handleDropOnFile(e: React.DragEvent, targetFile: ProjectFile) {
    e.preventDefault();
    setDragOverFileId(null);

    const files = e.dataTransfer.files;
    if (!files.length) return;

    const file = files[0];
    const groupId = targetFile.fileGroupId || targetFile.id;

    setUploadQueue([{
      file,
      category: targetFile.category || "OTHER",
      displayName: targetFile.displayName || targetFile.originalName,
      targetFileGroupId: groupId,
    }]);
  }

  // Upload a single file entry — sends file through our server to Google Drive
  async function uploadSingleFile(entry: UploadFileEntry): Promise<boolean> {
    const { file, category, displayName, targetFileGroupId } = entry;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);
    if (displayName && displayName !== file.name) {
      formData.append("displayName", displayName);
    }
    if (targetFileGroupId) {
      formData.append("targetFileGroupId", targetFileGroupId);
    }

    // Use XHR for upload progress tracking
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.timeout = 120000; // 2 minute timeout for large files

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true });
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ ok: false, error: data.error });
          } catch {
            resolve({ ok: false, error: `Upload failed (${xhr.status})` });
          }
        }
      });

      xhr.addEventListener("error", () => resolve({ ok: false, error: "Network error" }));
      xhr.addEventListener("timeout", () => resolve({ ok: false, error: "Upload timed out" }));

      xhr.open("POST", `/api/projects/${projectId}/upload`);
      xhr.send(formData);
    });

    if (!result.ok) {
      toast.error(`${file.name}: ${result.error || "Failed to upload"}`);
      return false;
    }

    return true;
  }

  // Process all files in the upload queue in parallel batches
  async function executeUpload() {
    if (!uploadQueue || uploadQueue.length === 0) return;

    // Snapshot the queue and close the modal
    const entries = [...uploadQueue];
    setUploadQueue(null);
    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    let failCount = 0;
    const BATCH_SIZE = 3;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((entry) => uploadSingleFile(entry))
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // Update progress based on completed batches
      setUploadProgress(Math.round(((i + batch.length) / entries.length) * 100));
    }

    setUploading(false);
    setUploadProgress(0);
    setExpandedGroup(null);
    setVersionHistory({});

    // Single summary toast
    if (successCount > 0 && failCount === 0) {
      toast.success(
        successCount === 1
          ? "File uploaded successfully"
          : `${successCount} files uploaded successfully`
      );
    } else if (successCount > 0 && failCount > 0) {
      toast.info(
        `${successCount} file${successCount !== 1 ? "s" : ""} uploaded successfully, ${failCount} failed`
      );
    } else if (failCount > 0) {
      toast.error(`${failCount} file${failCount !== 1 ? "s" : ""} failed to upload`);
    }

    // Always refresh the file list
    loadProject();
  }

  async function handleToggleCurrent(fileId: string, currentValue: boolean) {
    setTogglingCurrent(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCurrent: !currentValue }),
      });
      if (res.ok) {
        loadProject();
      } else {
        toast.error("Failed to update file");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setTogglingCurrent(null);
  }

  async function handleCategoryChange(fileId: string, category: FileCategory) {
    setUpdatingCategory(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (res.ok) {
        loadProject();
      } else {
        toast.error("Failed to update category");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setUpdatingCategory(null);
  }

  async function handleDeleteFile(fileId: string) {
    setDeleting(fileId);

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (res.ok) {
        setExpandedGroup(null);
        setVersionHistory({});
        toast.success("File deleted");
        loadProject();
      }
    } catch {
      toast.error("Failed to delete file");
    }
    setDeleting(null);
    setDeleteFileTarget(null);
  }

  async function handleDeleteProject() {
    setDeletingProject(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/admin/projects");
      }
    } catch {
      toast.error("Failed to delete project");
      setDeletingProject(false);
      setShowDeleteProject(false);
    }
  }

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
      toast.error("Failed to download files");
    }
    setDownloadingZip(false);
  }

  async function handleCompare(fileId: string, fileGroupId: string | null) {
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

  async function handleDetachFromGroup(fileId: string) {
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileGroupId: null, version: 1 }),
      });
      if (res.ok) {
        toast.success("File detached from version group");
        setExpandedGroup(null);
        setVersionHistory({});
        loadProject();
      } else {
        toast.error("Failed to detach file");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function loadActivity() {
    if (activityData) {
      setShowActivity(!showActivity);
      return;
    }
    setShowActivity(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/activity`);
      if (res.ok) {
        setActivityData(await res.json());
      }
    } catch {
      // ignore
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent, fileId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverFileId(fileId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFileId(null);
  }, []);

  if (loading) {
    return <ProjectDetailSkeleton />;
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

  /** Render a file table for a given category section */
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
                <col className="w-[3%]" />
                <col className="w-[35%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-3 py-3 font-medium text-slate-400">
                    <span className="sr-only">Current</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-400">File</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Size</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Category</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-400">
                      No files in this category
                    </td>
                  </tr>
                )}
                {items.map(({ latest, versionCount }) => {
                  const FileIcon = getFileIcon(latest.mimeType, latest.originalName);
                  const fileName = latest.displayName || latest.originalName;
                  const isDragOver = dragOverFileId === latest.id;

                  return (
                    <>
                      <tr
                        key={latest.id}
                        className={`transition-colors cursor-pointer ${
                          latest.isCurrent
                            ? "bg-green-500/[0.06] hover:bg-green-500/10"
                            : isDragOver
                              ? "bg-brand-500/10 ring-2 ring-inset ring-brand-400"
                              : "hover:bg-white/[0.03]"
                        }`}
                        onClick={(e) => {
                          const tag = (e.target as HTMLElement).closest("input, select, button, a");
                          if (tag) return;
                          if (canPreview(latest.mimeType, latest.originalName)) {
                            setPreviewFile(latest);
                          }
                        }}
                        onDragOver={(e) => handleDragOver(e, latest.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnFile(e, latest)}
                      >
                        <td className="px-3 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={latest.isCurrent}
                            disabled={togglingCurrent === latest.id}
                            onChange={() => handleToggleCurrent(latest.id, latest.isCurrent)}
                            className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-500 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
                            title="Mark as most up to date"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isUrlShortcut(latest.originalName) ? (
                              <a
                                href={`/api/files/${latest.id}/download`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-brand-400 hover:text-brand-300"
                              >
                                {fileName}
                              </a>
                            ) : canPreview(latest.mimeType, latest.originalName) ? (
                              <button
                                onClick={() => setPreviewFile(latest)}
                                className="font-medium text-brand-400 hover:text-brand-300 text-left"
                              >
                                {fileName}
                              </button>
                            ) : (
                              <a
                                href={`/api/files/${latest.id}/download`}
                                className="font-medium text-brand-400 hover:text-brand-300"
                              >
                                {fileName}
                              </a>
                            )}
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
                        <td className="px-4 py-4 text-slate-400 truncate">{formatSize(latest.size)}</td>
                        <td className="px-4 py-4 text-slate-400">
                          <span className="inline-flex items-center gap-1.5">
                            <FileIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            <span className="truncate">{getFileLabel(latest.mimeType, latest.originalName)}</span>
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <select
                            value={latest.category}
                            disabled={updatingCategory === latest.id}
                            onChange={(e) => handleCategoryChange(latest.id, e.target.value as FileCategory)}
                            className="w-full rounded-md border border-white/[0.1] bg-[#1a1d2e] px-2 py-1 text-xs text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                          >
                            <option value="RENDER">Renders</option>
                            <option value="DRAWING">Drawings</option>
                            <option value="CAD_DRAWING">CAD Drawings</option>
                            <option value="SUPPORTING">Supporting Docs</option>
                            <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                            <option value="OTHER">Others</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 text-slate-400 truncate">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            <a
                              href={`/api/files/${latest.id}/download`}
                              target={isUrlShortcut(latest.originalName) ? "_blank" : undefined}
                              rel={isUrlShortcut(latest.originalName) ? "noopener noreferrer" : undefined}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 transition-colors"
                            >
                              <Download className="h-4 w-4" />
                              {isUrlShortcut(latest.originalName) ? "Open Link" : "Download"}
                            </a>
                            <button
                              onClick={() => setDeleteFileTarget(latest.id)}
                              disabled={deleting === latest.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                            >
                              {deleting === latest.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Version history expansion */}
                      {expandedGroup === latest.id && versionCount > 1 && (
                        <tr key={`${latest.id}-versions`}>
                          <td colSpan={7} className="bg-white/[0.02] px-6 py-3">
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
                                    <button
                                      onClick={() => handleDetachFromGroup(v.id)}
                                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                      title="Detach from version group"
                                    >
                                      <Unlink className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteFileTarget(v.id)}
                                      disabled={deleting === v.id}
                                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-700 disabled:opacity-50"
                                    >
                                      {deleting === v.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
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
      <PageHeader
        title={project.name}
        description={`Created by ${project.createdBy.name} · ${formatRelativeDate(project.createdAt)}`}
      />

      {/* Status Timeline */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <StatusTimeline status={project.status} onStatusChange={handleStatusChange} />
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
                      {isImage(file.mimeType) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${file.id}/download?inline=true`}
                          alt={fileName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-white">
                            <PdfThumbnail fileId={file.id} alt={fileName} />
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]">
                            <FileIcon className="h-12 w-12 text-slate-600" />
                          </div>
                        </>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute left-3 top-3">
                        <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm`}>
                          {CATEGORY_LABELS[file.category]}
                        </span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <p className="truncate text-sm font-medium text-white">{fileName}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs text-white/60">{formatSize(file.size)}</span>
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
                      <div className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />
                      <div className="absolute left-3 top-4">
                        <span className={`inline-flex items-center rounded-full bg-gradient-to-r ${accent} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm`}>
                          {CATEGORY_LABELS[file.category]}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
                        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                          <FileIcon className="h-10 w-10 text-slate-300" />
                        </div>
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          {getFileLabel(file.mimeType, file.originalName)}
                        </span>
                      </div>
                      <div className="border-t border-white/[0.06] px-4 py-3">
                        <p className="truncate text-sm font-medium text-slate-200">{fileName}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs text-slate-500">{formatSize(file.size)}</span>
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

      {/* Files grouped by category */}
      {project.files.length === 0 ? (
        <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <EmptyState
            icon={FileX}
            title="No files yet"
            description="Upload a file using the drop zone above"
          />
        </div>
      ) : (
        CATEGORY_ORDER.map((cat) => renderCategorySection(cat))
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          files={project.files}
          onNavigate={(f) => setPreviewFile(f as ProjectFile)}
        />
      )}

      {/* Upload Modal */}
      {uploadQueue && uploadQueue.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-[#12141f] p-6 shadow-xl border border-white/[0.08] max-h-[80vh] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100">
                Upload {uploadQueue.length === 1 ? "File" : `${uploadQueue.length} Files`}
              </h3>
              <button
                onClick={() => setUploadQueue(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/[0.06] hover:text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {uploadQueue.length > 1 && (
              <div className="mb-4 flex items-center gap-3">
                <label className="text-xs font-medium text-slate-400 whitespace-nowrap">Set all to:</label>
                <select
                  onChange={(e) => {
                    const cat = e.target.value as FileCategory;
                    setUploadQueue((prev) =>
                      prev ? prev.map((item) => ({ ...item, category: cat })) : null
                    );
                    e.target.value = "";
                  }}
                  defaultValue=""
                  className="rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-2.5 py-1.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="" disabled>Choose category...</option>
                  <option value="RENDER">Renders</option>
                  <option value="DRAWING">Drawings</option>
                  <option value="CAD_DRAWING">CAD Drawings</option>
                  <option value="SUPPORTING">Supporting Docs</option>
                  <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                  <option value="OTHER">Others</option>
                </select>
              </div>
            )}

            <div className="overflow-y-auto flex-1 -mx-6 px-6 space-y-4">
              {uploadQueue.map((entry, idx) => (
                <div key={idx} className="rounded-lg border border-white/[0.08] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100 truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 whitespace-nowrap">{formatSize(entry.file.size)}</span>
                      {uploadQueue.length > 1 && (
                        <button
                          onClick={() => setUploadQueue((prev) => prev ? prev.filter((_, i) => i !== idx) : null)}
                          className="rounded p-0.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.targetFileGroupId && (
                    <div className="mb-3 flex items-center justify-between rounded-md bg-brand-500/10 px-3 py-2">
                      <p className="text-xs font-medium text-brand-400">
                        New version — will be added to the existing file group
                      </p>
                      <button
                        onClick={() =>
                          setUploadQueue((prev) =>
                            prev
                              ? prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, targetFileGroupId: null, displayName: item.file.name, category: "OTHER" as FileCategory }
                                    : item
                                )
                              : null
                          )
                        }
                        className="text-xs font-medium text-slate-400 hover:text-slate-200 whitespace-nowrap ml-3"
                      >
                        Upload as new file instead
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                      <select
                        value={entry.category}
                        onChange={(e) =>
                          setUploadQueue((prev) =>
                            prev
                              ? prev.map((item, i) =>
                                  i === idx ? { ...item, category: e.target.value as FileCategory } : item
                                )
                              : null
                          )
                        }
                        className="block w-full rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-2.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="RENDER">Renders</option>
                        <option value="DRAWING">Drawings</option>
                        <option value="CAD_DRAWING">CAD Drawings</option>
                        <option value="SUPPORTING">Supporting Docs</option>
                        <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                        <option value="OTHER">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Display Name</label>
                      <input
                        type="text"
                        value={entry.displayName}
                        onChange={(e) =>
                          setUploadQueue((prev) =>
                            prev
                              ? prev.map((item, i) =>
                                  i === idx ? { ...item, displayName: e.target.value } : item
                                )
                              : null
                          )
                        }
                        className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setUploadQueue(null)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Upload {uploadQueue.length > 1 ? `${uploadQueue.length} Files` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Activity */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <button
          onClick={loadActivity}
          className="flex w-full items-center gap-2 text-left"
        >
          {showActivity ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          <Activity className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-medium text-slate-100">Client Activity</h2>
        </button>

        {showActivity && (
          <div className="mt-4 space-y-2">
            {activityData === null ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : activityData.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                No file views recorded yet
              </p>
            ) : (
              activityData.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-2.5 border border-white/[0.06]"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-full bg-brand-500/20 flex items-center justify-center">
                      <span className="text-xs font-medium text-brand-400">
                        {view.user.name?.charAt(0).toUpperCase() || "?"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-slate-200">
                        <span className="font-medium">{view.user.name}</span>
                        {" viewed "}
                        <span className="text-brand-400">{view.file.displayName || view.file.originalName}</span>
                      </p>
                      <p className="text-xs text-slate-500">{view.user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(view.viewedAt).toLocaleDateString()} {new Date(view.viewedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Project Details */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <h2 className="mb-4 text-sm font-medium text-slate-100">Project Details</h2>
        <form onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-slate-300">
                Project name
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="edit-company" className="block text-sm font-medium text-slate-300">
                Company name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-company"
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="edit-thumbnail" className="block text-sm font-medium text-slate-300">
                Replace thumbnail <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-thumbnail"
                name="thumbnail"
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-400 hover:file:bg-brand-500/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-emails" className="block text-sm font-medium text-slate-300">
                Authorized access <span className="font-normal text-slate-400">(emails or @domain.com, comma-separated)</span>
              </label>
              <textarea
                id="edit-emails"
                rows={2}
                value={editEmails}
                onChange={(e) => setEditEmails(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="client@example.com, @acmecorp.com"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            {project.thumbnailPath && (
              <div>
                <p className="mb-1 text-xs text-slate-400">Current thumbnail</p>
                <div className="relative group inline-block">
                  <img
                    src={`/api/projects/${projectId}/thumbnail?v=${encodeURIComponent(project.thumbnailPath!)}`}
                    alt="Thumbnail"
                    className="h-20 w-auto rounded-lg border border-white/[0.08] object-cover"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/projects/${projectId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ removeThumbnail: true }),
                        });
                        if (res.ok) {
                          toast.success("Thumbnail removed");
                          loadProject();
                        } else {
                          toast.error("Failed to remove thumbnail");
                        }
                      } catch {
                        toast.error("Something went wrong");
                      }
                    }}
                    className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                    title="Remove thumbnail"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Upload File */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        <h2 className="mb-4 text-sm font-medium text-slate-100">Upload File</h2>
        <DropZone
          onFiles={handleFilesSelected}
          uploading={uploading}
          progress={uploadProgress}
        />
      </div>

      {/* Danger Zone */}
      <div className="overflow-hidden rounded-xl border border-red-500/20 bg-white/[0.03] p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-red-400">Danger Zone</h2>
        <p className="mb-4 text-sm text-slate-400">
          Deleting this project will permanently remove all associated files.
        </p>
        <button
          onClick={() => setShowDeleteProject(true)}
          disabled={deletingProject}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete Project
        </button>
      </div>

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

      {/* Confirm delete file */}
      <ConfirmModal
        open={deleteFileTarget !== null}
        title="Delete file"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting !== null}
        onConfirm={() => deleteFileTarget && handleDeleteFile(deleteFileTarget)}
        onCancel={() => setDeleteFileTarget(null)}
      />

      {/* Confirm delete project */}
      <ConfirmModal
        open={showDeleteProject}
        title="Delete project"
        message="Delete this entire project and all its files? This cannot be undone."
        confirmLabel="Delete Project"
        variant="danger"
        loading={deletingProject}
        onConfirm={handleDeleteProject}
        onCancel={() => setShowDeleteProject(false)}
      />

      {compareTarget && versionHistory[compareTarget] && (
        <FileComparisonModal
          versions={versionHistory[compareTarget]}
          onClose={() => setCompareTarget(null)}
        />
      )}
    </div>
  );
}
