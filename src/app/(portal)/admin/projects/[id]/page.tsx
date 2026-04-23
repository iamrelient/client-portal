"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Clock, Download, Eye, FileX, Folder as FolderIcon, FolderPlus, Globe, Loader2, Pencil, Plus, Trash2, X, Upload, Archive, Activity, Columns, Star, Unlink } from "lucide-react";
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
import { detectPanoramaFromFile } from "@/lib/pano-utils";
import { StatusTimeline } from "@/components/status-timeline";
import { FileComparisonModal } from "@/components/file-comparison-modal";
import { DownloadOptionsModal } from "@/components/download-options-modal";
import { InspirationBoard } from "@/components/inspiration-board";
import { PageHeader } from "@/components/page-header";
import { chunkedUpload } from "@/lib/chunked-upload";

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
  driveFolderId: string | null;
  authorizedEmails: string[];
  files: ProjectFile[];
  folders: ProjectFolder[];
  createdBy: { name: string };
  createdAt: string;
}

interface UploadFileEntry {
  file: File;
  category: FileCategory;
  customCategory: string;
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

export default function AdminProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
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
  const [bulkCustomMode, setBulkCustomMode] = useState(false);
  const [bulkCustomCategory, setBulkCustomCategory] = useState("");

  // Add URL state
  const [urlInput, setUrlInput] = useState("");
  const [urlCategory, setUrlCategory] = useState<FileCategory>("DESIGN_INSPIRATION");
  const [addingUrl, setAddingUrl] = useState(false);

  // Drag-drop state
  const [dragOverFileId, setDragOverFileId] = useState<string | null>(null);

  // Confirm modal state
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);
  const [showDeleteProject, setShowDeleteProject] = useState(false);

  const [editName, setEditName] = useState("");
  const [editEmails, setEditEmails] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editStatus, setEditStatus] = useState("concept");
  const [companies, setCompanies] = useState<{ id: string; name: string; logoPath: string | null }[]>([]);

  const [compareTarget, setCompareTarget] = useState<string | null>(null);

  // Folder UI state
  const [folderFormKey, setFolderFormKey] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [movingFileId, setMovingFileId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Bulk action state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

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
        setEditStatus(data.status || "concept");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadProject();
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => {
        setCompanies(data);
      })
      .catch(() => {});
  }, [projectId]);

  // Match company dropdown to project's current company name
  useEffect(() => {
    if (project && companies.length > 0) {
      const match = companies.find((c) => c.name === project.company);
      setEditCompanyId(match?.id || "");
    }
  }, [project, companies]);

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
      fd.set("companyId", editCompanyId);
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
    formData.set("companyId", editCompanyId);
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
      customCategory: "",
      displayName: file.name,
      targetFileGroupId: null,
    }));

    setUploadQueue(entries);
    setBulkCustomMode(false);
    setBulkCustomCategory("");
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
      customCategory: targetFile.customCategory || "",
      displayName: targetFile.displayName || targetFile.originalName,
      targetFileGroupId: groupId,
    }]);
  }

  // Add a URL as a .url shortcut file
  async function handleAddUrl() {
    if (!urlInput.trim() || addingUrl) return;

    let url = urlInput.trim();
    // Add https:// if no protocol
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    setAddingUrl(true);
    try {
      // Create a .url file content
      const content = `[InternetShortcut]\nURL=${url}\n`;
      // Extract a display name from the URL
      let displayName = url;
      try {
        const parsed = new URL(url);
        displayName = parsed.hostname.replace(/^www\./, "");
      } catch { /* use raw url */ }

      const fileName = `${displayName}.url`;
      const blob = new Blob([content], { type: "application/internet-shortcut" });
      const file = new File([blob], fileName, { type: "application/internet-shortcut" });

      // Use the same 3-step upload flow as regular files
      const ok = await uploadSingleFile({
        file,
        category: urlCategory,
        customCategory: "",
        displayName,
        targetFileGroupId: null,
      });

      if (ok) {
        toast.success("URL added");
        setUrlInput("");
        loadProject();
      }
    } catch (err) {
      toast.error("Failed to add URL");
      console.error(err);
    } finally {
      setAddingUrl(false);
    }
  }

  // Upload a single file entry — chunked upload with automatic retry
  async function uploadSingleFile(entry: UploadFileEntry): Promise<boolean> {
    const { file, category, customCategory, displayName, targetFileGroupId } = entry;

    try {
      // Kick off a 2:1 aspect-ratio check in parallel so a true 360 image
      // gets auto-flagged the moment it lands in the DB.
      const panoramaDetectionPromise = detectPanoramaFromFile(file);

      // Steps 1 & 2: Chunked upload to Google Drive via server proxy (auto-retry per chunk)
      const { driveFileId, size } = await chunkedUpload({
        file,
        projectId,
        onProgress: (percent) => setUploadProgress(percent),
      });

      const isPanorama = await panoramaDetectionPromise;

      // Step 3: Register the file in our database (small JSON request)
      const completeRes = await fetch(`/api/projects/${projectId}/upload-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFileId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size,
          category,
          customCategory: customCategory?.trim() || null,
          displayName: displayName && displayName !== file.name ? displayName : null,
          targetFileGroupId: targetFileGroupId || null,
          isPanorama,
        }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json().catch(() => ({ error: "Failed to register file" }));
        toast.error(`${file.name}: ${data.error}`);
        return false;
      }

      return true;
    } catch (err) {
      toast.error(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
      return false;
    }
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

  /** Build a stable key for a category + customCategory pair. Used for
   *  the "which section is opening the new-folder form" state. */
  function folderSectionKey(category: FileCategory, customCategory: string | null) {
    return customCategory ? `custom:${customCategory}` : `cat:${category}`;
  }

  async function handleCreateFolder(
    category: FileCategory,
    customCategory: string | null
  ) {
    const name = folderFormName.trim();
    if (!name) {
      toast.error("Folder name is required");
      return;
    }
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, customCategory }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create folder");
      } else {
        toast.success(`Folder "${name}" created`);
        setFolderFormKey(null);
        setFolderFormName("");
        loadProject();
      }
    } catch {
      toast.error("Something went wrong");
    }
    setCreatingFolder(false);
  }

  async function handleRenameFolder(folderId: string) {
    const name = renameFolderName.trim();
    if (!name) {
      setRenamingFolderId(null);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to rename folder");
      } else {
        toast.success("Folder renamed");
        setRenamingFolderId(null);
        setRenameFolderName("");
        loadProject();
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleDeleteFolder(folder: ProjectFolder) {
    if (!confirm(`Delete folder "${folder.name}"? It must be empty.`)) return;
    setDeletingFolderId(folder.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/folders/${folder.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to delete folder");
      } else {
        toast.success("Folder deleted");
        loadProject();
      }
    } catch {
      toast.error("Something went wrong");
    }
    setDeletingFolderId(null);
  }

  async function handleMoveFile(fileId: string, folderId: string | null) {
    setMovingFileId(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to move file");
      } else {
        loadProject();
      }
    } catch {
      toast.error("Something went wrong");
    }
    setMovingFileId(null);
  }

  function toggleAdminFolderExpanded(folderId: string) {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function toggleFileSelected(fileId: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleGroupSelected(ids: string[]) {
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

  /** Patch a list of files in parallel with the same body. */
  async function bulkPatchFiles(ids: string[], body: Record<string, unknown>) {
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/files/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Failed: ${id}`);
          }
        })
      )
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    return { failures };
  }

  async function handleBulkMoveToFolder(folderId: string | null) {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      const { failures } = await bulkPatchFiles(ids, { folderId });
      if (failures > 0) {
        toast.error(`${failures} file${failures === 1 ? "" : "s"} failed to move`);
      } else {
        toast.success(
          folderId
            ? `Moved ${ids.length} file${ids.length === 1 ? "" : "s"} to folder`
            : `Removed ${ids.length} file${ids.length === 1 ? "" : "s"} from folder`
        );
      }
      clearSelection();
      loadProject();
    } catch {
      toast.error("Something went wrong");
    }
    setBulkUpdating(false);
  }

  async function handleBulkChangeCategory(value: string) {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0 || !value) return;
    let body: Record<string, unknown>;
    if (value.startsWith("__EXISTING_CUSTOM__:")) {
      body = {
        category: "OTHER",
        customCategory: value.slice("__EXISTING_CUSTOM__:".length),
      };
    } else {
      body = { category: value, customCategory: null };
    }
    setBulkUpdating(true);
    try {
      const { failures } = await bulkPatchFiles(ids, body);
      if (failures > 0) {
        toast.error(
          `${failures} file${failures === 1 ? "" : "s"} failed to update`
        );
      } else {
        toast.success(
          `Updated category for ${ids.length} file${ids.length === 1 ? "" : "s"}`
        );
      }
      clearSelection();
      loadProject();
    } catch {
      toast.error("Something went wrong");
    }
    setBulkUpdating(false);
  }

  const [togglingOutdated, setTogglingOutdated] = useState<string | null>(null);
  const [togglingPanorama, setTogglingPanorama] = useState<string | null>(null);

  async function handleTogglePanorama(fileId: string, currentValue: boolean) {
    setTogglingPanorama(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPanorama: !currentValue }),
      });
      if (res.ok) {
        loadProject();
      } else {
        toast.error("Failed to update file");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setTogglingPanorama(null);
  }

  async function handleToggleOutdated(fileId: string, currentValue: boolean) {
    setTogglingOutdated(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOutdated: !currentValue }),
      });
      if (res.ok) {
        loadProject();
      } else {
        toast.error("Failed to update file");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setTogglingOutdated(null);
  }

  async function handleBulkMarkOutdated(outdated: boolean) {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      const { failures } = await bulkPatchFiles(ids, { isOutdated: outdated });
      if (failures > 0) {
        toast.error(`${failures} file${failures === 1 ? "" : "s"} failed to update`);
      } else {
        toast.success(
          outdated
            ? `Marked ${ids.length} file${ids.length === 1 ? "" : "s"} outdated`
            : `Cleared outdated on ${ids.length} file${ids.length === 1 ? "" : "s"}`
        );
      }
      clearSelection();
      loadProject();
    } catch {
      toast.error("Something went wrong");
    }
    setBulkUpdating(false);
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

  const [editingCustomCategory, setEditingCustomCategory] = useState<string | null>(null);
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [editingFileName, setEditingFileName] = useState<string | null>(null);
  const [fileNameInput, setFileNameInput] = useState("");

  async function handleFileNameSave(fileId: string) {
    const trimmed = fileNameInput.trim();
    setEditingFileName(null);
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (res.ok) {
        toast.success("File renamed");
        loadProject();
      } else {
        toast.error("Failed to rename file");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleCategoryChange(fileId: string, value: string) {
    if (value === "__CUSTOM__") {
      const file = project?.files.find((f) => f.id === fileId);
      setCustomCategoryInput(file?.customCategory || "");
      setEditingCustomCategory(fileId);
      return;
    }
    if (value.startsWith("__EXISTING_CUSTOM__:")) {
      const name = value.slice("__EXISTING_CUSTOM__:".length);
      setUpdatingCategory(fileId);
      setEditingCustomCategory(null);
      try {
        const res = await fetch(`/api/files/${fileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: "OTHER", customCategory: name }),
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
      return;
    }
    setUpdatingCategory(fileId);
    setEditingCustomCategory(null);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: value as FileCategory, customCategory: null }),
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

  async function handleCustomCategorySave(fileId: string) {
    const trimmed = customCategoryInput.trim();
    if (!trimmed) return;
    setUpdatingCategory(fileId);
    setEditingCustomCategory(null);
    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "OTHER", customCategory: trimmed }),
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

  /** Render a file table for a given category section */
  function renderCategorySection(category: FileCategory, label?: string, items?: { latest: ProjectFile; versionCount: number }[]) {
    const sectionItems = items || categorized.standard[category];
    const customCategoryName =
      label && label !== CATEGORY_LABELS[category] ? label : null;
    const sectionFolders = (project?.folders || []).filter(
      (f) =>
        f.category === category &&
        (f.customCategory ?? null) === customCategoryName
    );
    const sectionKey = folderSectionKey(category, customCategoryName);
    const isAddingFolder = folderFormKey === sectionKey;

    const looseItems = sectionItems.filter((i) => !i.latest.folderId);
    const folderItemsByFolder = new Map<
      string,
      { latest: ProjectFile; versionCount: number }[]
    >();
    for (const item of sectionItems) {
      if (item.latest.folderId) {
        const arr = folderItemsByFolder.get(item.latest.folderId) || [];
        arr.push(item);
        folderItemsByFolder.set(item.latest.folderId, arr);
      }
    }

    const sectionFileIds = sectionItems.map((i) => i.latest.id);
    const sectionAllSelected =
      sectionFileIds.length > 0 && sectionFileIds.every((id) => selectedFileIds.has(id));
    const sectionSomeSelected =
      !sectionAllSelected && sectionFileIds.some((id) => selectedFileIds.has(id));

    // Flat list of rows to render: loose files first, then for each folder
    // a divider entry followed by its files (only when expanded or empty).
    type DisplayEntry =
      | { kind: "file"; latest: ProjectFile; versionCount: number }
      | {
          kind: "divider";
          folder: ProjectFolder;
          count: number;
          isEmpty: boolean;
          isExpanded: boolean;
        };
    const displayEntries: DisplayEntry[] = [
      ...looseItems.map(
        (i) => ({ kind: "file", ...i }) as DisplayEntry
      ),
      ...sectionFolders.flatMap<DisplayEntry>((folder) => {
        const fItems = folderItemsByFolder.get(folder.id) || [];
        const isEmpty = fItems.length === 0;
        const isExpanded = expandedFolderIds.has(folder.id);
        const divider: DisplayEntry = {
          kind: "divider",
          folder,
          count: fItems.length,
          isEmpty,
          isExpanded,
        };
        if (!isExpanded || isEmpty) return [divider];
        return [
          divider,
          ...fItems.map((i) => ({ kind: "file", ...i }) as DisplayEntry),
        ];
      }),
    ];

    return (
      <div key={label || category} className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">
            {label || CATEGORY_LABELS[category]}
          </h2>
          {isAddingFolder ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5">
              <FolderPlus className="h-3.5 w-3.5 text-brand-300" />
              <input
                type="text"
                value={folderFormName}
                onChange={(e) => setFolderFormName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder(category, customCategoryName);
                  if (e.key === "Escape") {
                    setFolderFormKey(null);
                    setFolderFormName("");
                  }
                }}
                autoFocus
                placeholder="Folder name"
                className="w-32 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button
                onClick={() => handleCreateFolder(category, customCategoryName)}
                disabled={creatingFolder}
                className="text-xs font-medium text-brand-300 hover:text-brand-200 disabled:opacity-50"
              >
                {creatingFolder ? "…" : "Add"}
              </button>
              <button
                onClick={() => {
                  setFolderFormKey(null);
                  setFolderFormName("");
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setFolderFormKey(sectionKey);
                setFolderFormName("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2 py-0.5 text-xs text-slate-400 hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-300 transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <colgroup>
                <col style={{ width: "3rem" }} />
                <col className="w-[3%]" />
                <col className="w-[32%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={sectionAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = sectionSomeSelected;
                      }}
                      onChange={() => toggleGroupSelected(sectionFileIds)}
                      aria-label="Select all in section"
                      className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-800 accent-brand-500"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium text-slate-400">
                    <span className="sr-only">Featured</span>
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
                {sectionItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-400">
                      No files in this category
                    </td>
                  </tr>
                )}
                {displayEntries.map((entry) => {
                  if (entry.kind === "divider") {
                    const { folder, count, isEmpty, isExpanded } = entry;
                    return (
                      <Fragment key={`folder-divider-${folder.id}`}>
                        <tr
                          onClick={() =>
                            !isEmpty && toggleAdminFolderExpanded(folder.id)
                          }
                          className={`bg-white/[0.04] transition-colors ${
                            isEmpty ? "" : "cursor-pointer hover:bg-white/[0.06]"
                          }`}
                        >
                          <td
                            colSpan={8}
                            className="px-3 py-2.5 text-sm font-medium text-slate-200"
                          >
                            <div className="group/divider flex items-center gap-2">
                              {isEmpty ? (
                                <span className="inline-block h-4 w-4" />
                              ) : isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              )}
                              <FolderIcon className="h-4 w-4 text-brand-400" />
                              {renamingFolderId === folder.id ? (
                                <input
                                  type="text"
                                  value={renameFolderName}
                                  onChange={(e) => setRenameFolderName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameFolder(folder.id);
                                    if (e.key === "Escape") setRenamingFolderId(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                  className="rounded-md border border-brand-500 bg-[#1a1d2e] px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                              ) : (
                                <span>{folder.name}</span>
                              )}
                              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-normal text-slate-400">
                                {count}
                              </span>
                              {isEmpty && (
                                <span className="text-xs italic text-slate-500">
                                  empty
                                </span>
                              )}
                              <div
                                className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/divider:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {renamingFolderId === folder.id ? (
                                  <>
                                    <button
                                      onClick={() => handleRenameFolder(folder.id)}
                                      className="rounded px-2 py-0.5 text-xs font-medium text-brand-300 hover:bg-brand-500/10"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setRenamingFolderId(null)}
                                      className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setRenamingFolderId(folder.id);
                                        setRenameFolderName(folder.name);
                                      }}
                                      className="rounded p-1 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                                      title="Rename folder"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteFolder(folder)}
                                      disabled={deletingFolderId === folder.id}
                                      className="rounded p-1 text-slate-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                                      title="Delete folder"
                                    >
                                      {deletingFolderId === folder.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  }
                  const { latest, versionCount } = entry;
                  const FileIcon = getFileIcon(latest.mimeType, latest.originalName, { isPanorama: latest.isPanorama });
                  const fileName = latest.displayName || latest.originalName;
                  const isDragOver = dragOverFileId === latest.id;

                  return (
                    <>
                      <tr
                        key={latest.id}
                        className={`transition-colors cursor-pointer ${
                          selectedFileIds.has(latest.id)
                            ? "bg-brand-500/[0.08] hover:bg-brand-500/10"
                            : latest.isCurrent
                            ? "bg-green-500/[0.06] hover:bg-green-500/10"
                            : isDragOver
                              ? "bg-brand-500/10 ring-2 ring-inset ring-brand-400"
                              : "hover:bg-white/[0.03]"
                        } ${latest.isOutdated ? "opacity-60" : ""}`}
                        onClick={(e) => {
                          const tag = (e.target as HTMLElement).closest("input, select, button, a");
                          if (tag) return;
                          if (isUrlShortcut(latest.originalName)) {
                            window.open(`/api/files/${latest.id}/download`, "_blank");
                          } else if (canPreview(latest.mimeType, latest.originalName)) {
                            setPreviewFile(latest);
                          }
                        }}
                        onDragOver={(e) => handleDragOver(e, latest.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnFile(e, latest)}
                      >
                        <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedFileIds.has(latest.id)}
                            onChange={() => toggleFileSelected(latest.id)}
                            aria-label={`Select ${fileName}`}
                            className="h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-800 accent-brand-500"
                          />
                        </td>
                        <td className="px-3 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={latest.isCurrent}
                            disabled={togglingCurrent === latest.id}
                            onChange={() => handleToggleCurrent(latest.id, latest.isCurrent)}
                            className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-500 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
                            title="Mark as featured"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {editingFileName === latest.id ? (
                              <>
                                <input
                                  type="text"
                                  value={fileNameInput}
                                  onChange={(e) => setFileNameInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleFileNameSave(latest.id);
                                    if (e.key === "Escape") setEditingFileName(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                  placeholder="File name"
                                  className="min-w-0 flex-1 rounded-md border border-brand-500 bg-[#1a1d2e] px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFileNameSave(latest.id);
                                  }}
                                  className="text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingFileName(null);
                                  }}
                                  className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFileNameInput(fileName);
                                setEditingFileName(latest.id);
                              }}
                              className="rounded p-0.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
                              title="Rename file"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {latest.isCurrent && (
                              <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                                Featured
                              </span>
                            )}
                            {latest.isOutdated && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                                <Clock className="h-3 w-3" />
                                Outdated
                              </span>
                            )}
                            {latest.folderId && (() => {
                              const f = sectionFolders.find((x) => x.id === latest.folderId);
                              if (!f) return null;
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-slate-300">
                                  <FolderIcon className="h-3 w-3" />
                                  {f.name}
                                </span>
                              );
                            })()}
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
                        <td className="px-4 py-4">
                          {editingCustomCategory === latest.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={customCategoryInput}
                                onChange={(e) => setCustomCategoryInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleCustomCategorySave(latest.id);
                                  if (e.key === "Escape") setEditingCustomCategory(null);
                                }}
                                autoFocus
                                placeholder="Category name"
                                className="w-full rounded-md border border-brand-500 bg-[#1a1d2e] px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <button
                                onClick={() => handleCustomCategorySave(latest.id)}
                                className="text-xs text-brand-400 hover:text-brand-300 whitespace-nowrap"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <select
                              value={latest.customCategory ? "__CUSTOM__" : latest.category}
                              disabled={updatingCategory === latest.id}
                              onChange={(e) => handleCategoryChange(latest.id, e.target.value)}
                              className="w-full rounded-md border border-white/[0.1] bg-[#1a1d2e] px-2 py-1 text-xs text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                            >
                              <option value="RENDER">Renders</option>
                              <option value="DRAWING">Drawings</option>
                              <option value="CAD_DRAWING">CAD Drawings</option>
                              <option value="SUPPORTING">Supporting Docs</option>
                              <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                              <option value="OTHER">Others</option>
                              {Object.keys(categorized.custom).map((name) => (
                                <option key={name} value={`__EXISTING_CUSTOM__:${name}`}>{name}</option>
                              ))}
                              <option value="__CUSTOM__">{latest.customCategory ? latest.customCategory : "Custom..."}</option>
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-400 truncate">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-1">
                            {sectionFolders.length > 0 && (
                              <select
                                value={latest.folderId ?? ""}
                                disabled={movingFileId === latest.id}
                                onChange={(e) =>
                                  handleMoveFile(latest.id, e.target.value || null)
                                }
                                title="Move to folder"
                                className="rounded-md border border-white/[0.1] bg-[#1a1d2e] px-1.5 py-1 text-xs text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                              >
                                <option value="">— No folder —</option>
                                {sectionFolders.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    📁 {f.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => handleToggleOutdated(latest.id, latest.isOutdated)}
                              disabled={togglingOutdated === latest.id}
                              title={latest.isOutdated ? "Clear outdated" : "Mark as outdated"}
                              className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                                latest.isOutdated
                                  ? "text-amber-400 hover:bg-amber-500/10"
                                  : "text-slate-500 hover:bg-white/[0.06] hover:text-amber-400"
                              }`}
                            >
                              {togglingOutdated === latest.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Clock className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleTogglePanorama(latest.id, latest.isPanorama)}
                              disabled={togglingPanorama === latest.id}
                              title={latest.isPanorama ? "Unmark 360" : "Mark as 360"}
                              className={`inline-flex items-center rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                                latest.isPanorama
                                  ? "text-brand-400 hover:bg-brand-500/10"
                                  : "text-slate-500 hover:bg-white/[0.06] hover:text-brand-400"
                              }`}
                            >
                              {togglingPanorama === latest.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Globe className="h-4 w-4" />
                              )}
                            </button>
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
                          <td colSpan={8} className="bg-white/[0.02] px-6 py-3">
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
        logo={project.companyLogoPath ? `/api/projects/${projectId}/company-logo` : undefined}
      />

      {/* Status Timeline */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl">
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
              const FileIcon = getFileIcon(file.mimeType, file.originalName, { isPanorama: file.isPanorama });
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
                          {file.customCategory || CATEGORY_LABELS[file.category]}
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
                          {file.customCategory || CATEGORY_LABELS[file.category]}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
                        <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.08]">
                          <FileIcon className="h-10 w-10 text-slate-300" />
                        </div>
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                          {getFileLabel(file.mimeType, file.originalName, { isPanorama: file.isPanorama })}
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
        <>
          {CATEGORY_ORDER.filter(
            (cat) => cat !== "DESIGN_INSPIRATION" && categorized.standard[cat].length > 0
          ).map((cat) => renderCategorySection(cat))}
          {Object.entries(categorized.custom)
            .sort(([, a], [, b]) => {
              const aMax = Math.max(...a.map((f) => new Date(f.latest.createdAt).getTime()));
              const bMax = Math.max(...b.map((f) => new Date(f.latest.createdAt).getTime()));
              return bMax - aMax;
            })
            .map(([name, files]) =>
              renderCategorySection("OTHER", name, files)
            )}
          {categorized.standard.DESIGN_INSPIRATION.length > 0 && (
            <InspirationBoard
              key="DESIGN_INSPIRATION"
              files={categorized.standard.DESIGN_INSPIRATION}
              projectId={project.id}
              userRole="ADMIN"
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
        // itself is kept even if it's an old version (admin clicked it
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
                    const val = e.target.value;
                    if (val === "__CUSTOM__") {
                      setBulkCustomMode(true);
                      setBulkCustomCategory("");
                      setUploadQueue((prev) =>
                        prev ? prev.map((item) => ({ ...item, category: "OTHER" as FileCategory, customCategory: " " })) : null
                      );
                    } else if (val.startsWith("__EXISTING_CUSTOM__:")) {
                      const name = val.slice("__EXISTING_CUSTOM__:".length);
                      setBulkCustomMode(false);
                      setBulkCustomCategory("");
                      setUploadQueue((prev) =>
                        prev ? prev.map((item) => ({ ...item, category: "OTHER" as FileCategory, customCategory: name })) : null
                      );
                    } else {
                      setBulkCustomMode(false);
                      setBulkCustomCategory("");
                      const cat = val as FileCategory;
                      setUploadQueue((prev) =>
                        prev ? prev.map((item) => ({ ...item, category: cat, customCategory: "" })) : null
                      );
                    }
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
                  {Object.keys(categorized.custom).map((name) => (
                    <option key={name} value={`__EXISTING_CUSTOM__:${name}`}>{name}</option>
                  ))}
                  <option value="__CUSTOM__">Custom...</option>
                </select>
              </div>
            )}
            {bulkCustomMode && uploadQueue.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-400 mb-1">Custom Category Name (all files)</label>
                <input
                  type="text"
                  value={bulkCustomCategory}
                  placeholder="e.g. Floor Plans, Elevations"
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value || " ";
                    setBulkCustomCategory(e.target.value);
                    setUploadQueue((prev) =>
                      prev ? prev.map((item) => ({ ...item, customCategory: val })) : null
                    );
                  }}
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
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

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                        <select
                          value={entry.customCategory ? "__CUSTOM__" : entry.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val.startsWith("__EXISTING_CUSTOM__:")) {
                              const name = val.slice("__EXISTING_CUSTOM__:".length);
                              setUploadQueue((prev) =>
                                prev
                                  ? prev.map((item, i) =>
                                      i === idx ? { ...item, category: "OTHER" as FileCategory, customCategory: name } : item
                                    )
                                  : null
                              );
                            } else {
                              setUploadQueue((prev) =>
                                prev
                                  ? prev.map((item, i) =>
                                      i === idx
                                        ? val === "__CUSTOM__"
                                          ? { ...item, category: "OTHER" as FileCategory, customCategory: " " }
                                          : { ...item, category: val as FileCategory, customCategory: "" }
                                        : item
                                    )
                                  : null
                              );
                            }
                          }}
                          className="block w-full rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-2.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="RENDER">Renders</option>
                          <option value="DRAWING">Drawings</option>
                          <option value="CAD_DRAWING">CAD Drawings</option>
                          <option value="SUPPORTING">Supporting Docs</option>
                          <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                          <option value="OTHER">Others</option>
                          {Object.keys(categorized.custom).map((name) => (
                            <option key={name} value={`__EXISTING_CUSTOM__:${name}`}>{name}</option>
                          ))}
                          <option value="__CUSTOM__">Custom...</option>
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
                    {entry.customCategory && !bulkCustomMode ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Custom Category Name</label>
                        <input
                          type="text"
                          value={entry.customCategory === " " ? "" : entry.customCategory}
                          placeholder="e.g. Floor Plans, Elevations"
                          autoFocus
                          onChange={(e) =>
                            setUploadQueue((prev) =>
                              prev
                                ? prev.map((item, i) =>
                                    i === idx ? { ...item, customCategory: e.target.value || " " } : item
                                  )
                                : null
                            )
                          }
                          className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                    ) : null}
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
                Company <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                id="edit-company"
                value={editCompanyId}
                onChange={(e) => setEditCompanyId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">None</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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

      {/* Add URL + Upload File */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
        {/* Add URL */}
        <div className="mb-4">
          <h2 className="mb-3 text-sm font-medium text-slate-100 flex items-center gap-2">
            <Globe className="h-4 w-4 text-brand-400" />
            Add URL
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddUrl(); }}
              placeholder="Paste a URL (e.g. https://example.com)"
              className="flex-1 rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <select
              value={urlCategory}
              onChange={(e) => setUrlCategory(e.target.value as FileCategory)}
              className="rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
            <button
              onClick={handleAddUrl}
              disabled={!urlInput.trim() || addingUrl}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {addingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative mb-4">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.06]" /></div>
          <div className="relative flex justify-center"><span className="bg-[#12141f] px-3 text-xs text-slate-500">or upload files</span></div>
        </div>

        {/* Upload Files */}
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

      {/* Bulk action bar — floats at bottom when any file is selected */}
      {selectedFileIds.size > 0 && project && (() => {
        // Group folders by category for the "Move to folder" optgroups.
        const byCat = new Map<string, ProjectFolder[]>();
        for (const f of project.folders || []) {
          const key = f.customCategory
            ? `Custom · ${f.customCategory}`
            : CATEGORY_LABELS[f.category];
          const arr = byCat.get(key) || [];
          arr.push(f);
          byCat.set(key, arr);
        }
        const catEntries = Array.from(byCat.entries()).sort(([a], [b]) =>
          a.localeCompare(b)
        );
        const existingCustom = Object.keys(categorized.custom);

        return (
          <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-gray-900/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <span className="px-2 text-sm font-medium text-slate-200">
                {selectedFileIds.size} selected
              </span>
              <select
                value=""
                disabled={bulkUpdating}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  handleBulkMoveToFolder(v === "__NONE__" ? null : v);
                  e.currentTarget.value = "";
                }}
                className="rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-1.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="" disabled>
                  Move to folder…
                </option>
                <option value="__NONE__">— No folder —</option>
                {catEntries.map(([label, folders]) => (
                  <optgroup key={label} label={label}>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value=""
                disabled={bulkUpdating}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  handleBulkChangeCategory(v);
                  e.currentTarget.value = "";
                }}
                className="rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-1.5 text-sm text-slate-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="" disabled>
                  Change category…
                </option>
                <option value="RENDER">Renders</option>
                <option value="DRAWING">Drawings</option>
                <option value="CAD_DRAWING">CAD Drawings</option>
                <option value="SUPPORTING">Supporting Docs</option>
                <option value="DESIGN_INSPIRATION">Design Inspirations</option>
                <option value="OTHER">Others</option>
                {existingCustom.length > 0 && (
                  <optgroup label="Custom">
                    {existingCustom.map((name) => (
                      <option key={name} value={`__EXISTING_CUSTOM__:${name}`}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                onClick={() => handleBulkMarkOutdated(true)}
                disabled={bulkUpdating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
              >
                <Clock className="h-4 w-4" />
                Mark outdated
              </button>
              <button
                onClick={() => handleBulkMarkOutdated(false)}
                disabled={bulkUpdating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#1a1d2e] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
              >
                Clear outdated
              </button>
              {bulkUpdating && (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              )}
              <button
                onClick={clearSelection}
                disabled={bulkUpdating}
                className="rounded-full px-3 py-1.5 text-sm text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
