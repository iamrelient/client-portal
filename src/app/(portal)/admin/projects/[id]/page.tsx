"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, Eye, FileX, Loader2, Trash2, X, Upload } from "lucide-react";
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

  function loadProject() {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data);
        setEditName(data.name);
        setEditEmails(data.authorizedEmails?.join(", ") || "");
        setEditCompany(data.company || "");
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

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("name", editName);
    formData.set("emails", editEmails);
    formData.set("company", editCompany);

    // Compress images before uploading
    const thumbnail = formData.get("thumbnail") as File | null;
    if (thumbnail && thumbnail.size > 0) {
      formData.set("thumbnail", await compressImage(thumbnail));
    }
    const companyLogo = formData.get("companyLogo") as File | null;
    if (companyLogo && companyLogo.size > 0) {
      formData.set("companyLogo", await compressImage(companyLogo));
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

  // Upload a single file entry to Drive and register it
  async function uploadSingleFile(entry: UploadFileEntry): Promise<boolean> {
    const { file, category, displayName, targetFileGroupId } = entry;

    const sessionRes = await fetch(`/api/projects/${projectId}/upload-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      }),
    });

    if (!sessionRes.ok) {
      const data = await sessionRes.json();
      toast.error(`${file.name}: ${data.error || "Failed to start upload"}`);
      return false;
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
      toast.error(`${file.name}: Upload succeeded but no file ID returned`);
      return false;
    }

    const completeRes = await fetch(`/api/projects/${projectId}/upload-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        driveFileId: driveResult.id,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: Number(driveResult.size) || file.size,
        category,
        displayName: displayName !== file.name ? displayName : null,
        targetFileGroupId,
      }),
    });

    if (!completeRes.ok) {
      const data = await completeRes.json();
      toast.error(`${file.name}: ${data.error || "Failed to register file"}`);
      return false;
    }

    return true;
  }

  // Process all files in the upload queue
  async function executeUpload() {
    if (!uploadQueue || uploadQueue.length === 0) return;

    // Snapshot the queue and close the modal
    const entries = [...uploadQueue];
    setUploadQueue(null);
    setUploading(true);
    setUploadProgress(0);

    let successCount = 0;

    try {
      for (let i = 0; i < entries.length; i++) {
        setUploadProgress(0);
        const ok = await uploadSingleFile(entries[i]);
        if (ok) successCount++;
      }
    } catch {
      toast.error("Upload failed");
    }

    setUploading(false);
    setUploadProgress(0);
    setExpandedGroup(null);
    setVersionHistory({});

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? "File uploaded successfully"
          : `${successCount} files uploaded successfully`
      );
      loadProject();
    }
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
      <div className="flex h-96 items-center justify-center text-slate-500">
        Project not found
      </div>
    );
  }

  const categorized = groupByCategory(project.files);

  /** Render a file table for a given category section */
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
                  <th className="w-10 px-3 py-3 font-medium text-slate-500">
                    <span className="sr-only">Current</span>
                  </th>
                  <th className="px-6 py-3 font-medium text-slate-500">File</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Type</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Category</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                  <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
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
                        className={`transition-colors ${
                          latest.isCurrent
                            ? "bg-green-50/60 hover:bg-green-50"
                            : isDragOver
                              ? "bg-brand-50 ring-2 ring-inset ring-brand-400"
                              : "hover:bg-slate-50"
                        }`}
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
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
                            title="Mark as most up to date"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/files/${latest.id}/download`}
                              className="font-medium text-brand-600 hover:text-brand-500"
                            >
                              {fileName}
                            </a>
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
                        <td className="px-6 py-4">
                          <select
                            value={latest.category}
                            disabled={updatingCategory === latest.id}
                            onChange={(e) => handleCategoryChange(latest.id, e.target.value as FileCategory)}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                          >
                            <option value="RENDER">Renders</option>
                            <option value="DRAWING">Drawings</option>
                            <option value="OTHER">Others</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {formatRelativeDate(latest.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {canPreview(latest.mimeType, latest.originalName) && (
                              <button
                                onClick={() => setPreviewFile(latest)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500"
                              >
                                <Eye className="h-4 w-4" />
                                View
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteFileTarget(latest.id)}
                              disabled={deleting === latest.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
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
                          <td colSpan={7} className="bg-slate-50 px-6 py-3">
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
                                    <button
                                      onClick={() => setDeleteFileTarget(v.id)}
                                      disabled={deleting === v.id}
                                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
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

      {/* Project Details */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-medium text-slate-900">Project Details</h2>
        <form onSubmit={handleSave}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-slate-700">
                Project name
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="edit-company" className="block text-sm font-medium text-slate-700">
                Company name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-company"
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="edit-thumbnail" className="block text-sm font-medium text-slate-700">
                Replace thumbnail <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-thumbnail"
                name="thumbnail"
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
            </div>
            <div>
              <label htmlFor="edit-companyLogo" className="block text-sm font-medium text-slate-700">
                Company logo <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="edit-companyLogo"
                name="companyLogo"
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-emails" className="block text-sm font-medium text-slate-700">
                Authorized access <span className="font-normal text-slate-400">(emails or @domain.com, comma-separated)</span>
              </label>
              <textarea
                id="edit-emails"
                rows={2}
                value={editEmails}
                onChange={(e) => setEditEmails(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="client@example.com, @acmecorp.com"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            {project.thumbnailPath && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Current thumbnail</p>
                <img
                  src={`/api/projects/${projectId}/thumbnail?v=${encodeURIComponent(project.thumbnailPath!)}`}
                  alt="Thumbnail"
                  className="h-20 w-auto rounded-lg border border-slate-200 object-cover"
                />
              </div>
            )}
            {project.companyLogoPath && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Current company logo</p>
                <img
                  src={`/api/projects/${projectId}/company-logo?v=${encodeURIComponent(project.companyLogoPath!)}`}
                  alt="Company logo"
                  className="h-20 w-auto rounded-lg border border-slate-200 object-contain bg-white p-1"
                />
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
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-medium text-slate-900">Upload File</h2>
        <DropZone
          onFiles={handleFilesSelected}
          uploading={uploading}
          progress={uploadProgress}
        />
      </div>

      {/* Files grouped by category */}
      {project.files.length === 0 ? (
        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
        />
      )}

      {/* Upload Modal */}
      {uploadQueue && uploadQueue.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[80vh] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Upload {uploadQueue.length === 1 ? "File" : `${uploadQueue.length} Files`}
              </h3>
              <button
                onClick={() => setUploadQueue(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 -mx-6 px-6 space-y-4">
              {uploadQueue.map((entry, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 whitespace-nowrap">{formatSize(entry.file.size)}</span>
                      {uploadQueue.length > 1 && (
                        <button
                          onClick={() => setUploadQueue((prev) => prev ? prev.filter((_, i) => i !== idx) : null)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.targetFileGroupId && (
                    <div className="mb-3 rounded-md bg-brand-50 px-3 py-2">
                      <p className="text-xs font-medium text-brand-700">
                        New version — will be added to the existing file group
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
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
                        className="block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="RENDER">Renders</option>
                        <option value="DRAWING">Drawings</option>
                        <option value="OTHER">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
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
                        className="block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setUploadQueue(null)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
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

      {/* Danger Zone */}
      <div className="overflow-hidden rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-red-600">Danger Zone</h2>
        <p className="mb-4 text-sm text-slate-600">
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
    </div>
  );
}
