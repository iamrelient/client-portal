"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Download } from "lucide-react";

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

export default function DashboardFilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
        title="Files"
        description={`${files.length} file${files.length !== 1 ? "s" : ""} available`}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">File</th>
                <th className="px-6 py-3 font-medium text-slate-500">Size</th>
                <th className="px-6 py-3 font-medium text-slate-500">Type</th>
                <th className="px-6 py-3 font-medium text-slate-500">Date</th>
                <th className="px-6 py-3 font-medium text-slate-500">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {file.originalName}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {formatSize(file.size)}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{file.mimeType}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={`/api/files/${file.id}/download`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No files available
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
