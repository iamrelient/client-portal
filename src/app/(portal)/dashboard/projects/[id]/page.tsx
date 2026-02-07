"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Download, Eye, X } from "lucide-react";

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
  files: ProjectFile[];
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

export default function ClientProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);

  useEffect(() => {
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
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
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

  return (
    <div>
      {/* Company branding header */}
      {project.company && (
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {project.companyLogoPath && (
            <img
              src={`/api/projects/${projectId}/company-logo`}
              alt={project.company}
              className="h-14 w-auto object-contain"
            />
          )}
          <div>
            <p className="text-lg font-semibold text-slate-900">{project.company}</p>
          </div>
        </div>
      )}

      <PageHeader title={project.name} />

      {/* Files Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">File</th>
                <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {project.files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {file.originalName}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{formatSize(file.size)}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {canPreview(file.mimeType) && (
                        <button
                          onClick={() => setPreviewFile(file)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      )}
                      <a
                        href={`/api/files/${file.id}/download`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {project.files.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No files in this project yet
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
    </div>
  );
}
