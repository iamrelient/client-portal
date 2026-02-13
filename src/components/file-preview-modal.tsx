"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { canPreview3D, get3DFormat } from "@/lib/model-utils";
import { ModelViewer } from "@/components/model-viewer";

interface PreviewFile {
  id: string;
  originalName: string;
  mimeType: string;
  version?: number;
}

interface FilePreviewModalProps {
  file: PreviewFile;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const downloadUrl = `/api/files/${file.id}/download`;
  const inlineUrl = `${downloadUrl}?inline=true`;
  const is3D = canPreview3D(file.mimeType, file.originalName);
  const isPdf = file.mimeType === "application/pdf";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-3"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full flex-col bg-white sm:h-[95vh] sm:max-h-[95vh] sm:max-w-[95vw] sm:rounded-xl sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 flex-1 font-medium text-slate-900 truncate pr-4">
            {file.originalName}
            {file.version && file.version > 1 && (
              <span className="ml-2 text-sm text-slate-400">v{file.version}</span>
            )}
          </h3>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-500 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 p-2 sm:p-4">
          {is3D ? (
            <div className="min-h-0 flex-1">
              <ModelViewer
                url={inlineUrl}
                format={get3DFormat(file.originalName)!}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={inlineUrl}
              className="min-h-0 flex-1 w-full rounded-lg border border-slate-200"
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <img
                src={inlineUrl}
                alt={file.originalName}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
