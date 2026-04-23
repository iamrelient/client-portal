"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import {
  Loader2,
  Trash2,
  Plus,
  GripVertical,
  Copy,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Eye,
  Upload,
  Settings2,
} from "lucide-react";
import { PanoramaEditor } from "@/components/admin/panorama-editor";
import type { PanoramaMetadata } from "@/types/panorama";
import { Model3DEditor } from "@/components/admin/model-3d-editor";
import type { Model3DMetadata } from "@/types/model3d";
import { canPreview3D } from "@/lib/model-utils";

interface FileOption {
  id: string;
  originalName: string;
  mimeType: string;
}

interface SectionRow {
  id: string;
  type: string;
  order: number;
  fileId: string | null;
  title: string | null;
  description: string | null;
  chapter: string | null;
  transitionStyle: string | null;
  metadata: Record<string, unknown> | null;
  file: { id: string; originalName: string; mimeType: string; size: number } | null;
}

interface PresentationDetail {
  id: string;
  title: string | null;
  subtitle: string | null;
  clientLogo: string | null;
  logoDisplay: string | null;
  logoSize: string | null;
  clientAccentColor: string | null;
  password: string | null;
  expiresAt: string | null;
  isActive: boolean;
  accessToken: string;
  watermarkEnabled: boolean;
  project: { id: string; name: string };
  sections: SectionRow[];
  _count: { accessLogs: number };
}

const SECTION_TYPES = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "panorama", label: "360° Panorama" },
  { value: "text", label: "Text" },
  { value: "3d-model", label: "3D Model" },
  { value: "divider", label: "Divider" },
];

const TRANSITIONS = [
  { value: "", label: "Auto" },
  { value: "fade", label: "Fade" },
  { value: "wipe-left", label: "Wipe Left" },
  { value: "wipe-right", label: "Wipe Right" },
  { value: "scale", label: "Scale" },
  { value: "parallax", label: "Parallax" },
];

const AMBIENT_STYLES = [
  { value: "", label: "Random" },
  { value: "grid", label: "Grid Lines" },
  { value: "particles", label: "Particles" },
  { value: "line-pulse", label: "Line Pulse" },
  { value: "gradient-shift", label: "Gradient Shift" },
];

export default function EditPresentationPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [pres, setPres] = useState<PresentationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectFiles, setProjectFiles] = useState<FileOption[]>([]);

  // Settings form
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [clientLogo, setClientLogo] = useState("");
  const [logoDisplay, setLogoDisplay] = useState("auto");
  const [logoSize, setLogoSize] = useState("medium");
  const [accentColor, setAccentColor] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  // File upload
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextRef = useRef<{ onUploaded: (fileId: string) => void } | null>(null);

  // Panorama editor
  const [expandedPanoramaId, setExpandedPanoramaId] = useState<string | null>(null);

  // 3D Model editor
  const [expandedModel3DId, setExpandedModel3DId] = useState<string | null>(null);

  // Add section
  const [addingType, setAddingType] = useState("");
  const [addingSectionLoading, setAddingSectionLoading] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/presentations/${params.id}`)
      .then((res) => res.json())
      .then((data: PresentationDetail) => {
        setPres(data);
        setTitle(data.title || "");
        setSubtitle(data.subtitle || "");
        setClientLogo(data.clientLogo || "");
        setLogoDisplay(data.logoDisplay || "auto");
        setLogoSize(data.logoSize || "medium");
        setAccentColor(data.clientAccentColor || "");
        setExpiresAt(
          data.expiresAt
            ? new Date(data.expiresAt).toISOString().slice(0, 16)
            : ""
        );
        setWatermarkEnabled(data.watermarkEnabled);
        setLoading(false);

        // Load project files
        fetch(`/api/projects/${data.project.id}/files`)
          .then((r) => r.json())
          .then((files) => {
            if (Array.isArray(files)) {
              setProjectFiles(
                files.map((f: FileOption & Record<string, unknown>) => ({
                  id: f.id,
                  originalName: f.originalName,
                  mimeType: f.mimeType,
                }))
              );
            }
          })
          .catch(() => {});
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function triggerUpload(accept: string, onUploaded: (fileId: string) => void) {
    if (!fileInputRef.current || !pres) return;
    uploadContextRef.current = { onUploaded };
    fileInputRef.current.accept = accept;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  async function handleFileUpload(file: File) {
    if (!pres) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${pres.project.id}/files`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Refresh file list
        const filesRes = await fetch(`/api/projects/${pres.project.id}/files`);
        if (filesRes.ok) {
          const files = await filesRes.json();
          if (Array.isArray(files)) {
            setProjectFiles(
              files.map((f: FileOption & Record<string, unknown>) => ({
                id: f.id,
                originalName: f.originalName,
                mimeType: f.mimeType,
              }))
            );
          }
        }
        // Call the context callback with the new file ID
        uploadContextRef.current?.onUploaded(data.fileId);
        toast.success("File uploaded");
      } else {
        toast.error("Upload failed");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setUploading(false);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        title: title || null,
        subtitle: subtitle || null,
        clientLogo: clientLogo || null,
        logoDisplay: logoDisplay || null,
        logoSize: logoSize || null,
        clientAccentColor: accentColor || null,
        expiresAt: expiresAt || null,
        watermarkEnabled,
      };

      if (newPassword) {
        body.password = newPassword;
      }

      const res = await fetch(`/api/presentations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("Settings saved");
        setNewPassword("");
        load();
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  }

  async function handleAddSection() {
    if (!addingType) return;
    setAddingSectionLoading(true);

    try {
      const body: Record<string, unknown> = { type: addingType };

      if (addingType === "divider") {
        body.metadata = { ambientStyle: "" };
      }

      // Pre-fill chapter from last content section
      if (addingType !== "divider" && pres) {
        const sorted = [...pres.sections].sort((a, b) => a.order - b.order);
        const lastContent = sorted
          .filter((s) => !["hero", "closing", "divider"].includes(s.type))
          .pop();
        if (lastContent?.chapter) {
          body.chapter = lastContent.chapter;
        }
      }

      const res = await fetch(`/api/presentations/${params.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success("Section added");
        setAddingType("");
        load();
      } else {
        toast.error("Failed to add section");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setAddingSectionLoading(false);
  }

  async function handleDeleteSection(sectionId: string, type: string) {
    if (type === "hero" || type === "closing") return;
    if (!confirm("Delete this section?")) return;

    try {
      const res = await fetch(
        `/api/presentations/${params.id}/sections/${sectionId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Section deleted");
        load();
      } else {
        toast.error("Failed to delete section");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleMoveSection(sectionId: string, direction: "up" | "down") {
    if (!pres) return;
    const sections = [...pres.sections].sort((a, b) => a.order - b.order);
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    // Don't swap past hero (index 0) or closing (last)
    if (sections[swapIdx].type === "hero" || sections[swapIdx].type === "closing") return;
    if (sections[idx].type === "hero" || sections[idx].type === "closing") return;

    const reordered = sections.map((s, i) => {
      if (i === idx) return { id: s.id, order: sections[swapIdx].order };
      if (i === swapIdx) return { id: s.id, order: sections[idx].order };
      return { id: s.id, order: s.order };
    });

    try {
      await fetch(`/api/presentations/${params.id}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: reordered }),
      });
      load();
    } catch {
      toast.error("Failed to reorder");
    }
  }

  async function handleUpdateSection(
    sectionId: string,
    updates: Record<string, unknown>
  ) {
    try {
      const res = await fetch(
        `/api/presentations/${params.id}/sections/${sectionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );
      if (res.ok) {
        load();
      } else {
        toast.error("Failed to update section");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function handleRegenerateLink() {
    if (!confirm("Regenerate share link? The old link will stop working."))
      return;

    try {
      const res = await fetch(`/api/presentations/${params.id}/share`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("New link generated");
        load();
      } else {
        toast.error("Failed to regenerate");
      }
    } catch {
      toast.error("Something went wrong");
    }
  }

  function copyLink() {
    if (!pres) return;
    const url = `${window.location.origin}/present/${pres.accessToken}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    });
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Edit Presentation" description="Loading..." />
        <TableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  if (!pres) {
    return (
      <div>
        <PageHeader
          title="Presentation Not Found"
          description="This presentation may have been deleted."
        />
      </div>
    );
  }

  const sections = [...pres.sections].sort((a, b) => a.order - b.order);

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
        }}
      />
      <PageHeader
        title={pres.title || pres.project.name}
        description={`Project: ${pres.project.name} · ${pres._count.accessLogs} view${pres._count.accessLogs !== 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/present/${pres.accessToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.05] transition-colors"
            >
              <Eye className="h-4 w-4" />
              Preview
            </a>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Sections */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section list */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-medium text-slate-100">Sections</h2>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {sections.map((section, idx) => {
                const isFixed =
                  section.type === "hero" || section.type === "closing";
                const canMoveUp =
                  !isFixed && idx > 1; // Can't go above hero
                const canMoveDown =
                  !isFixed && idx < sections.length - 2; // Can't go below closing

                return (
                  <div key={section.id}>
                  <div
                    className="px-6 py-3 flex items-start gap-3"
                  >
                    {/* Grip / order controls */}
                    <div className="flex flex-col items-center gap-0.5 pt-1">
                      {isFixed ? (
                        <GripVertical className="h-4 w-4 text-slate-600" />
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              handleMoveSection(section.id, "up")
                            }
                            disabled={!canMoveUp}
                            className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              handleMoveSection(section.id, "down")
                            }
                            disabled={!canMoveDown}
                            className="text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Section content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-white/[0.06] text-slate-300 uppercase">
                          {section.type}
                        </span>
                        {isFixed && (
                          <span className="text-xs text-slate-500">
                            Auto-generated
                          </span>
                        )}
                      </div>

                      {/* Hero background image picker */}
                      {section.type === "hero" && (
                        <div className="mt-2">
                          <div className="flex gap-1.5">
                            <select
                              value={section.fileId || ""}
                              onChange={(e) =>
                                handleUpdateSection(section.id, {
                                  fileId: e.target.value || null,
                                })
                              }
                              className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                            >
                              <option value="">First image (default)</option>
                              {projectFiles
                                .filter((f) => f.mimeType.startsWith("image/"))
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.originalName}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() =>
                                triggerUpload("image/*", (fileId) =>
                                  handleUpdateSection(section.id, { fileId })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Upload hero image"
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            Background image for the hero slide
                          </p>
                        </div>
                      )}

                      {/* Editable fields per type */}
                      {(section.type === "image" ||
                        section.type === "video" ||
                        section.type === "panorama") && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="flex gap-1.5">
                            <select
                              value={section.fileId || ""}
                              onChange={(e) =>
                                handleUpdateSection(section.id, {
                                  fileId: e.target.value || null,
                                })
                              }
                              className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                            >
                              <option value="">Select file...</option>
                              {projectFiles
                                .filter((f) => {
                                  if (section.type === "video")
                                    return f.mimeType.startsWith("video/");
                                  return f.mimeType.startsWith("image/");
                                })
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.originalName}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() =>
                                triggerUpload(
                                  section.type === "video" ? "video/*" : "image/*",
                                  (fileId) =>
                                    handleUpdateSection(section.id, { fileId })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Upload from computer"
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          {section.type === "image" && (
                            <select
                              value={section.transitionStyle || ""}
                              onChange={(e) =>
                                handleUpdateSection(section.id, {
                                  transitionStyle: e.target.value || null,
                                })
                              }
                              className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                            >
                              {TRANSITIONS.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <input
                            type="text"
                            defaultValue={section.title || ""}
                            placeholder="Caption title (optional)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                title: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            defaultValue={section.description || ""}
                            placeholder="Caption description (optional)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                description: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            defaultValue={section.chapter || ""}
                            placeholder="Chapter (e.g. Main Lobby)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                chapter: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      )}

                      {section.type === "text" && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            defaultValue={section.title || ""}
                            placeholder="Section title"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                title: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                          <textarea
                            defaultValue={section.description || ""}
                            placeholder="Body text (use Enter for line breaks)"
                            rows={3}
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                description: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none resize-y"
                          />
                          <input
                            type="text"
                            defaultValue={section.chapter || ""}
                            placeholder="Chapter (e.g. Main Lobby)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                chapter: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      )}

                      {section.type === "divider" && (
                        <div className="mt-2">
                          <select
                            value={
                              (section.metadata as Record<string, string>)
                                ?.ambientStyle || ""
                            }
                            onChange={(e) =>
                              handleUpdateSection(section.id, {
                                metadata: {
                                  ambientStyle: e.target.value || null,
                                },
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none sm:w-48"
                          >
                            {AMBIENT_STYLES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {section.type === "3d-model" && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div className="flex gap-1.5">
                            <select
                              value={section.fileId || ""}
                              onChange={(e) =>
                                handleUpdateSection(section.id, {
                                  fileId: e.target.value || null,
                                })
                              }
                              className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                            >
                              <option value="">Select 3D file...</option>
                              {projectFiles
                                .filter((f) =>
                                  canPreview3D(f.mimeType, f.originalName)
                                )
                                .map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.originalName}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() =>
                                triggerUpload(
                                  ".glb,.gltf,.fbx,.obj",
                                  (fileId) =>
                                    handleUpdateSection(section.id, { fileId })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Upload 3D model"
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <input
                            type="text"
                            defaultValue={section.title || ""}
                            placeholder="Section title (optional)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                title: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                          <input
                            type="text"
                            defaultValue={section.chapter || ""}
                            placeholder="Chapter (e.g. Floor Plan)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                chapter: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 mt-1">
                      {/* Configure 360° button for panorama sections */}
                      {section.type === "panorama" && section.fileId && (
                        <button
                          onClick={() =>
                            setExpandedPanoramaId(
                              expandedPanoramaId === section.id
                                ? null
                                : section.id
                            )
                          }
                          className={`rounded-lg p-1.5 transition-colors ${
                            expandedPanoramaId === section.id
                              ? "text-brand-400 bg-brand-500/10"
                              : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
                          }`}
                          title="Configure 360°"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Configure 3D model button */}
                      {section.type === "3d-model" && section.fileId && (
                        <button
                          onClick={() =>
                            setExpandedModel3DId(
                              expandedModel3DId === section.id
                                ? null
                                : section.id
                            )
                          }
                          className={`rounded-lg p-1.5 transition-colors ${
                            expandedModel3DId === section.id
                              ? "text-brand-400 bg-brand-500/10"
                              : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
                          }`}
                          title="Configure 3D Model"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Delete */}
                      {!isFixed && (
                        <button
                          onClick={() =>
                            handleDeleteSection(section.id, section.type)
                          }
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Delete section"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panorama editor expansion */}
                  {section.type === "panorama" &&
                    expandedPanoramaId === section.id &&
                    section.fileId && (
                      <PanoramaEditor
                        sectionId={section.id}
                        imageUrl={`/api/files/${section.fileId}/download?inline=true`}
                        metadata={
                          (section.metadata as PanoramaMetadata) || {}
                        }
                        allSections={sections}
                        projectFiles={projectFiles}
                        onSave={async (metadata) => {
                          await handleUpdateSection(section.id, { metadata });
                        }}
                      />
                    )}

                  {/* 3D Model editor expansion */}
                  {section.type === "3d-model" &&
                    expandedModel3DId === section.id &&
                    section.fileId &&
                    section.file && (
                      <Model3DEditor
                        fileUrl={`/api/files/${section.fileId}/download?inline=true`}
                        fileName={section.file.originalName}
                        metadata={
                          (section.metadata as Model3DMetadata) || {}
                        }
                        allSections={sections}
                        projectFiles={projectFiles}
                        onSave={async (metadata) => {
                          await handleUpdateSection(section.id, { metadata });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add section */}
            <div className="px-6 py-3 border-t border-white/[0.06] flex items-center gap-2">
              <select
                value={addingType}
                onChange={(e) => setAddingType(e.target.value)}
                className="block rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
              >
                <option value="">Add section...</option>
                {SECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddSection}
                disabled={!addingType || addingSectionLoading}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {addingSectionLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Right column: Settings + Share */}
        <div className="space-y-4">
          {/* Settings */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-medium text-slate-100">Settings</h2>
            </div>
            <form onSubmit={handleSaveSettings} className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={pres.project.name}
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Optional subtitle"
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Client Logo
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={clientLogo}
                    onChange={(e) => setClientLogo(e.target.value)}
                    className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">No logo</option>
                    {projectFiles
                      .filter((f) => f.mimeType.startsWith("image/"))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.originalName}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() =>
                      triggerUpload("image/*", (fileId) =>
                        setClientLogo(fileId)
                      )
                    }
                    className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-2 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                    title="Upload from computer"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {clientLogo && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Logo Display
                    </label>
                    <select
                      value={logoDisplay}
                      onChange={(e) => setLogoDisplay(e.target.value)}
                      className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                    >
                      <option value="auto">Auto (frosted backdrop)</option>
                      <option value="white">White version</option>
                      <option value="light-bg">Light background</option>
                      <option value="transparent">Transparent (no background)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Logo Size
                    </label>
                    <select
                      value={logoSize}
                      onChange={(e) => setLogoSize(e.target.value)}
                      className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor || "#3b82f6"}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-8 rounded border border-white/[0.1] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="block flex-1 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Expires At
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white [&>option]:text-black focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={
                    pres.password
                      ? "Leave blank to keep current"
                      : "Leave blank for no password"
                  }
                  className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="watermark"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-600 focus:ring-brand-500"
                />
                <label
                  htmlFor="watermark"
                  className="text-sm text-slate-300"
                >
                  Watermark enabled
                </label>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Settings"
                )}
              </button>
            </form>
          </div>

          {/* Share panel */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-medium text-slate-100">
                Share Link
              </h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-slate-400 font-mono break-all">
                {window.location.origin}/present/{pres.accessToken}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  Copy Link
                </button>
                <button
                  onClick={handleRegenerateLink}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {pres._count.accessLogs} view{pres._count.accessLogs !== 1 ? "s" : ""} ·{" "}
                {pres.isActive ? "Active" : "Revoked"}
                {pres.expiresAt &&
                  ` · Expires ${new Date(pres.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
