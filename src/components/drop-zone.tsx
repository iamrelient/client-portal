"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface DropZoneProps {
  onFiles: (files: FileList) => void;
  uploading: boolean;
  progress: number;
  accept?: string;
}

/** Recursively read all files from a directory entry */
async function readEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([])
      );
    });
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      const allEntries: FileSystemEntry[] = [];
      const readBatch = () => {
        dirReader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...batch);
            readBatch();
          }
        }, () => resolve(allEntries));
      };
      readBatch();
    });

    const files: File[] = [];
    for (const child of entries) {
      files.push(...(await readEntryFiles(child)));
    }
    return files;
  }

  return [];
}

/** Convert file array to a FileList-like object */
function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

export function DropZone({ onFiles, uploading, progress, accept }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (uploading) return;

      // Try to detect directory entries via webkitGetAsEntry
      const items = e.dataTransfer.items;
      let hasDirectory = false;

      if (items?.length) {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            hasDirectory = true;
            break;
          }
        }
      }

      if (hasDirectory) {
        const allFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) {
            allFiles.push(...(await readEntryFiles(entry)));
          }
        }
        if (allFiles.length > 0) {
          onFiles(toFileList(allFiles));
        }
      } else if (e.dataTransfer.files.length > 0) {
        onFiles(e.dataTransfer.files);
      }
    },
    [onFiles, uploading]
  );

  const handleClick = () => {
    if (!uploading) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFiles(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-brand-500 bg-brand-500/10"
            : "border-white/[0.1] hover:border-white/[0.2]"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <Upload className="mx-auto h-8 w-8 text-slate-500" />
        <p className="mt-2 text-sm font-medium text-slate-300">
          Drag files or folders here, or click to browse
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {accept ? `Accepted: ${accept}` : "Any file type"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
      {uploading && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
