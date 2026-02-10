"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronRight, Download, Eye, Loader2, Trash2, Upload, X } from "lucide-react";

interface ProjectFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreview(mimeType: string) {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/")
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

export default function AdminProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<Record<string, ProjectFile[]>>({});

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
    setError("");
    setSuccess("");
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("name", editName);
    formData.set("emails", editEmails);
    formData.set("company", editCompany);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      setSuccess("Project updated");
      setSaving(false);
      loadProject();
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  async function handleUpload() {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) return;

    const file = fileInput.files[0];
    setError("");
    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Get resumable upload URI from our server
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
        setError(data.error || "Failed to start upload");
        setUploading(false);
        return;
      }

      const { uploadUri } = await sessionRes.json();

      // Step 2: Upload file directly to Google Drive with progress tracking
      const driveResult = await new Promise<{ id: string; name: string; size: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadUri);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      // Step 3: Register the uploaded file in our DB
      const completeRes = await fetch(`/api/projects/${projectId}/upload-complete`, {
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
        setError(data.error || "Failed to register file");
        setUploading(false);
        return;
      }

      setUploading(false);
      setUploadProgress(0);
      fileInput.value = "";
      setExpandedGroup(null);
      setVersionHistory({});
      loadProject();
    } catch {
      setError("Upload failed");
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file?")) return;
    setDeleting(fileId);

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (res.ok) {
        setExpandedGroup(null);
        setVersionHistory({});
        loadProject();
      }
    } catch {
      // ignore
    }
    setDeleting(null);
  }

  async function handleDeleteProject() {
    if (!confirm("Delete this entire project and all its files? This cannot be undone."))
      return;

    setDeletingProject(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/admin/projects");
      }
    } catch {
      setError("Failed to delete project");
      setDeletingProject(false);
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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
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

  const grouped = getLatestFiles(project.files);

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`Created by ${project.createdBy.name} on ${new Date(project.createdAt).toLocaleDateString()}`}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
          {success}
        </div>
      )}

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
                  src={`/api/projects/${projectId}/thumbnail`}
                  alt="Thumbnail"
                  className="h-20 w-auto rounded-lg border border-slate-200 object-cover"
                />
              </div>
            )}
            {project.companyLogoPath && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Current company logo</p>
                <img
                  src={`/api/projects/${projectId}/company-logo`}
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
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              ref={fileInputRef}
              type="file"
              className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </button>
        </div>
        {/* Progress bar */}
        {uploading && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Files Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
              {grouped.map(({ latest, versionCount }) => (
                <>
                  <tr key={latest.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/files/${latest.id}/download`}
                          className="font-medium text-brand-600 hover:text-brand-500"
                        >
                          {latest.originalName}
                        </a>
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
                    <td className="px-6 py-4 text-slate-600">{latest.mimeType}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {new Date(latest.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {canPreview(latest.mimeType) && (
                          <button
                            onClick={() => setPreviewFile(latest)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteFile(latest.id)}
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
                                  {new Date(v.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                {canPreview(v.mimeType) && (
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
                                  onClick={() => handleDeleteFile(v.id)}
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
              ))}
              {project.files.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No files uploaded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="font-medium text-slate-900 truncate">
                {previewFile.originalName}
                {previewFile.version > 1 && (
                  <span className="ml-2 text-sm text-slate-400">v{previewFile.version}</span>
                )}
              </h3>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/files/${previewFile.id}/download`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewFile.mimeType === "application/pdf" ? (
                <iframe
                  src={`/api/files/${previewFile.id}/download?inline=true`}
                  className="h-full w-full rounded-lg border border-slate-200"
                />
              ) : (
                <img
                  src={`/api/files/${previewFile.id}/download?inline=true`}
                  alt={previewFile.originalName}
                  className="mx-auto max-h-full max-w-full object-contain"
                />
              )}
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
          onClick={handleDeleteProject}
          disabled={deletingProject}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
        >
          {deletingProject ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete Project
        </button>
      </div>
    </div>
  );
}
