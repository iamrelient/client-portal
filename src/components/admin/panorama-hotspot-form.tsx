"use client";

import { useState } from "react";
import type {
  PanoramaHotspot,
  NavigationHotspot,
  InfoHotspot,
  InfoContent,
} from "@/types/panorama";
import { Trash2 } from "lucide-react";

interface FileOption {
  id: string;
  originalName: string;
  mimeType: string;
}

interface SectionOption {
  id: string;
  title: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
}

interface PanoramaHotspotFormProps {
  hotspot: PanoramaHotspot | null; // null = new hotspot
  pitch: number;
  yaw: number;
  panoramaSections: SectionOption[];
  projectFiles: FileOption[];
  onSave: (hotspot: PanoramaHotspot) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function PanoramaHotspotForm({
  hotspot,
  pitch,
  yaw,
  panoramaSections,
  projectFiles,
  onSave,
  onCancel,
  onDelete,
}: PanoramaHotspotFormProps) {
  const [hsType, setHsType] = useState<"navigation" | "info">(
    hotspot?.type || "navigation"
  );
  const [label, setLabel] = useState(hotspot?.label || "");
  const [targetSectionId, setTargetSectionId] = useState(
    hotspot?.type === "navigation" ? hotspot.targetSectionId : ""
  );

  // Info content state
  const existingContent =
    hotspot?.type === "info" ? hotspot.content : undefined;
  const [contentType, setContentType] = useState<
    "text" | "image" | "video" | "pdf"
  >(existingContent?.type || "text");
  const [textTitle, setTextTitle] = useState(
    existingContent?.type === "text" ? existingContent.title : ""
  );
  const [textBody, setTextBody] = useState(
    existingContent?.type === "text" ? existingContent.body : ""
  );
  const [imageFileId, setImageFileId] = useState(
    existingContent?.type === "image" ? existingContent.fileId : ""
  );
  const [imageCaption, setImageCaption] = useState(
    existingContent?.type === "image" ? existingContent.caption || "" : ""
  );
  const [videoUrl, setVideoUrl] = useState(
    existingContent?.type === "video" ? existingContent.url : ""
  );
  const [pdfFileId, setPdfFileId] = useState(
    existingContent?.type === "pdf" ? existingContent.fileId : ""
  );
  const [pdfTitle, setPdfTitle] = useState(
    existingContent?.type === "pdf" ? existingContent.title || "" : ""
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!label.trim()) return;

    const id = hotspot?.id || crypto.randomUUID();

    if (hsType === "navigation") {
      if (!targetSectionId) return;
      const nav: NavigationHotspot = {
        id,
        type: "navigation",
        pitch,
        yaw,
        label: label.trim(),
        targetSectionId,
      };
      onSave(nav);
    } else {
      let content: InfoContent;
      switch (contentType) {
        case "text":
          if (!textTitle.trim()) return;
          content = { type: "text", title: textTitle.trim(), body: textBody };
          break;
        case "image":
          if (!imageFileId) return;
          content = {
            type: "image",
            fileId: imageFileId,
            ...(imageCaption ? { caption: imageCaption } : {}),
          };
          break;
        case "video":
          if (!videoUrl.trim()) return;
          content = { type: "video", url: videoUrl.trim() };
          break;
        case "pdf":
          if (!pdfFileId) return;
          content = {
            type: "pdf",
            fileId: pdfFileId,
            ...(pdfTitle ? { title: pdfTitle } : {}),
          };
          break;
      }
      const info: InfoHotspot = {
        id,
        type: "info",
        pitch,
        yaw,
        label: label.trim(),
        content,
      };
      onSave(info);
    }
  }

  const inputClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none";
  const selectClass =
    "block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-slate-200">
          {hotspot ? "Edit Hotspot" : "New Hotspot"}
        </h4>
        <span className="text-[10px] text-slate-500 font-mono">
          {pitch.toFixed(1)}, {yaw.toFixed(1)}
        </span>
      </div>

      {/* Type toggle */}
      <div className="flex rounded-lg overflow-hidden border border-white/[0.1]">
        <button
          type="button"
          onClick={() => setHsType("navigation")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            hsType === "navigation"
              ? "bg-brand-600 text-white"
              : "bg-white/[0.05] text-slate-400 hover:text-white"
          }`}
        >
          Navigation
        </button>
        <button
          type="button"
          onClick={() => setHsType("info")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            hsType === "info"
              ? "bg-brand-600 text-white"
              : "bg-white/[0.05] text-slate-400 hover:text-white"
          }`}
        >
          Info
        </button>
      </div>

      {/* Label */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={hsType === "navigation" ? "e.g. Living Room" : "e.g. Feature Details"}
          className={inputClass}
          required
        />
      </div>

      {/* Navigation fields */}
      {hsType === "navigation" && (
        <div>
          <label className="block text-[10px] font-medium text-slate-400 mb-1">
            Target Room
          </label>
          <select
            value={targetSectionId}
            onChange={(e) => setTargetSectionId(e.target.value)}
            className={selectClass}
            required
          >
            <option value="">Select panorama...</option>
            {panoramaSections.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.metadata as Record<string, string>)?.roomLabel ||
                  s.title ||
                  `Panorama ${s.id.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Info fields */}
      {hsType === "info" && (
        <>
          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1">
              Content Type
            </label>
            <select
              value={contentType}
              onChange={(e) =>
                setContentType(e.target.value as typeof contentType)
              }
              className={selectClass}
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          {contentType === "text" && (
            <>
              <input
                type="text"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="Title"
                className={inputClass}
                required
              />
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                placeholder="Body text..."
                rows={3}
                className={inputClass + " resize-y"}
              />
            </>
          )}

          {contentType === "image" && (
            <>
              <select
                value={imageFileId}
                onChange={(e) => setImageFileId(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select image...</option>
                {projectFiles
                  .filter((f) => f.mimeType.startsWith("image/"))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.originalName}
                    </option>
                  ))}
              </select>
              <input
                type="text"
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
                placeholder="Caption (optional)"
                className={inputClass}
              />
            </>
          )}

          {contentType === "video" && (
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="YouTube / Vimeo URL"
              className={inputClass}
              required
            />
          )}

          {contentType === "pdf" && (
            <>
              <select
                value={pdfFileId}
                onChange={(e) => setPdfFileId(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select PDF...</option>
                {projectFiles
                  .filter((f) => f.mimeType === "application/pdf")
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.originalName}
                    </option>
                  ))}
              </select>
              <input
                type="text"
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
                placeholder="Document title (optional)"
                className={inputClass}
              />
            </>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
        >
          {hotspot ? "Update" : "Add Hotspot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        {hotspot && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Delete hotspot"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
