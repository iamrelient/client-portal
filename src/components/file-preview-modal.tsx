"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Download, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
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
  files?: PreviewFile[];
  onNavigate?: (file: PreviewFile) => void;
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 px-2 py-1 backdrop-blur-sm">
      <button onClick={() => zoomOut()} className="rounded-full p-1.5 text-white/70 hover:text-white transition-colors">
        <ZoomOut className="h-4 w-4" />
      </button>
      <button onClick={() => resetTransform()} className="rounded-full px-2 py-1 text-xs text-white/70 hover:text-white transition-colors">
        Reset
      </button>
      <button onClick={() => zoomIn()} className="rounded-full p-1.5 text-white/70 hover:text-white transition-colors">
        <ZoomIn className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FilePreviewModal({ file, onClose, files, onNavigate }: FilePreviewModalProps) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const currentIndex = files?.findIndex((f) => f.id === file.id) ?? -1;
  const hasPrev = files && currentIndex > 0;
  const hasNext = files && currentIndex < files.length - 1;

  const goToPrev = useCallback(() => {
    if (hasPrev && onNavigate) {
      onNavigate(files![currentIndex - 1]);
    }
  }, [hasPrev, onNavigate, files, currentIndex]);

  const goToNext = useCallback(() => {
    if (hasNext && onNavigate) {
      onNavigate(files![currentIndex + 1]);
    }
  }, [hasNext, onNavigate, files, currentIndex]);

  // Keyboard: Escape to close, arrow keys to navigate
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goToPrev, goToNext]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Touch gesture handlers — only navigate when not zoomed in
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && !isZoomed) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [isZoomed]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current || e.changedTouches.length !== 1 || isZoomed) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;
      touchStart.current = null;

      // Only trigger if horizontal swipe > 50px and more horizontal than vertical
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) goToPrev();
        else goToNext();
      }
    },
    [goToPrev, goToNext, isZoomed]
  );

  const downloadUrl = `/api/files/${file.id}/download`;
  const inlineUrl = `${downloadUrl}?inline=true`;
  const is3D = canPreview3D(file.mimeType, file.originalName);
  const isPdf = file.mimeType === "application/pdf";
  const isImage = file.mimeType.startsWith("image/");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-3"
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full flex-col bg-[#12141f] sm:h-[95vh] sm:max-h-[95vh] sm:max-w-[95vw] sm:rounded-xl sm:shadow-2xl border border-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 flex-1 font-medium text-slate-100 truncate pr-4">
            {file.originalName}
            {file.version && file.version > 1 && (
              <span className="ml-2 text-sm text-slate-400">v{file.version}</span>
            )}
            {files && files.length > 1 && (
              <span className="ml-2 text-sm text-slate-500">
                {currentIndex + 1} of {files.length}
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-400 hover:bg-brand-500/10 hover:text-brand-300 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-black/30 p-2 sm:p-4">
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
              className="min-h-0 flex-1 w-full rounded-lg border border-white/[0.08]"
            />
          ) : isImage ? (
            <TransformWrapper
              key={file.id}
              minScale={1}
              maxScale={8}
              doubleClick={{ mode: "zoomIn", step: 2 }}
              pinch={{ step: 5 }}
              wheel={{ step: 0.1 }}
              onTransformed={(_ref, state) => {
                setIsZoomed(state.scale > 1.05);
              }}
            >
              <ZoomControls />
              <TransformComponent
                wrapperClass="!flex-1 !min-h-0 !w-full"
                contentClass="!flex !items-center !justify-center !min-h-full !w-full"
              >
                <img
                  src={inlineUrl}
                  alt={file.originalName}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <img
                src={inlineUrl}
                alt={file.originalName}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          {/* Navigation arrows */}
          {files && files.length > 1 && (
            <>
              {hasPrev && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {hasNext && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
