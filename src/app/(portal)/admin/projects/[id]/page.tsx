"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Loader2, Trash2, Upload } from "lucide-react";

interface ProjectFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  thumbnailPath: string | null;
  company: string | null;
  companyLogoPath: string | null;
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

export default function AdminProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setUploading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      setUploading(false);
      (e.target as HTMLFormElement).reset();
      loadProject();
    } catch {
      setError("Upload failed");
      setUploading(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file?")) return;
    setDeleting(fileId);

    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (res.ok) loadProject();
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
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              name="file"
              type="file"
              required
              className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <button
            type="submit"
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
        </form>
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
              {project.files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <a
                      href={`/api/files/${file.id}/download`}
                      className="font-medium text-brand-600 hover:text-brand-500"
                    >
                      {file.originalName}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{formatSize(file.size)}</td>
                  <td className="px-6 py-4 text-slate-600">{file.mimeType}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDeleteFile(file.id)}
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
                  </td>
                </tr>
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
