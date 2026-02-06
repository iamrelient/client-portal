"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Loader2, Trash2, Upload } from "lucide-react";

interface FileRow {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  uploadedBy: { name: string; email: string };
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminFilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  function loadFiles() {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadFiles();
  }, []);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setUploading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      setUploading(false);
      (e.target as HTMLFormElement).reset();
      loadFiles();
    } catch {
      setError("Upload failed");
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this file?")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadFiles();
      }
    } catch {
      // ignore
    }
    setDeleting(null);
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="File Management"
        description={`${files.length} file${files.length !== 1 ? "s" : ""} uploaded`}
      />

      {/* Upload Form */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="file" className="block text-sm font-medium text-slate-700 mb-1">
              Upload a file
            </label>
            <input
              id="file"
              name="file"
              type="file"
              required
              className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </button>
        </form>
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Files Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">File</th>
                <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                <th className="px-6 py-3 font-medium text-slate-500">Type</th>
                <th className="px-6 py-3 font-medium text-slate-500">Uploaded By</th>
                <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <a
                      href={`/api/files/${file.id}/download`}
                      className="font-medium text-blue-600 hover:text-blue-500"
                    >
                      {file.originalName}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatSize(file.size)}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{file.mimeType}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {file.uploadedBy.name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDelete(file.id)}
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
              {files.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No files uploaded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
