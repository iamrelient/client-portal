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
  Images,
  X,
} from "lucide-react";
import { FilePickerModal } from "@/components/file-picker-modal";
import { PanoramaEditor } from "@/components/admin/panorama-editor";
import type { PanoramaMetadata } from "@/types/panorama";
import { Model3DEditor } from "@/components/admin/model-3d-editor";
import type { Model3DMetadata } from "@/types/model3d";
import { canPreview3D } from "@/lib/model-utils";
import { PresentationFloorPlanMap } from "@/components/admin/presentation-floor-plan-map";

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
  panoramaFloorWatermark: boolean;
  project: { id: string; name: string };
  sections: SectionRow[];
  _count: { accessLogs: number };
}

const SECTION_TYPES = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "panorama", label: "360° Panorama" },
  { value: "3d-model", label: "3D Model" },
  { value: "divider", label: "Divider / Title slide" },
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
  const [panoramaFloorWatermark, setPanoramaFloorWatermark] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  // File upload
  const [uploading, setUploading] = useState(false);
  /** Active file-picker target. When set, the FilePickerModal is open;
   *  onPick delivers one or more selected fileIds (single- or multi-
   *  select depending on the `multiSelect` flag). */
  const [picker, setPicker] = useState<{
    accept: string;
    title: string;
    multiSelect: boolean;
    onPick: (fileIds: string[]) => void;
    /** Called when the modal closes without a pick (X / Esc / backdrop)
     *  so Promise-wrapped callers can resolve to null. */
    onCancel?: () => void;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadContextRef = useRef<{ onUploaded: (fileId: string) => void } | null>(null);

  // Panorama editor
  const [expandedPanoramaId, setExpandedPanoramaId] = useState<string | null>(null);
  /** Section id we just *programmatically* switched to via the drag-
   *  to-link flow. The render effect uses this to scroll the freshly-
   *  opened editor into view once it actually mounts (one tick later,
   *  after `load()` finishes). Cleared after scrolling. */
  const pendingScrollIdRef = useRef<string | null>(null);

  // 3D Model editor
  const [expandedModel3DId, setExpandedModel3DId] = useState<string | null>(null);

  // Add section
  const [addingType, setAddingType] = useState("");
  const [addingSectionLoading, setAddingSectionLoading] = useState(false);
  /** True while a batch of "add panoramas" sections is being POSTed.
   *  Disables the bulk button so spam-clicks can't double-create. */
  const [bulkAddingPanoramas, setBulkAddingPanoramas] = useState(false);

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
        setPanoramaFloorWatermark(data.panoramaFloorWatermark ?? true);
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

  /** When the drag-to-link flow asked us to switch panoramas, scroll
   *  the freshly-mounted editor into view once it's actually present
   *  in the DOM. We key on `pres` so this fires after `load()` brings
   *  the new metadata in. */
  useEffect(() => {
    const target = pendingScrollIdRef.current;
    if (!target || !pres) return;
    // Defer one frame so the expanded editor markup has time to render.
    const timeoutId = window.setTimeout(() => {
      const el = document.querySelector(`[data-section-id="${target}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      pendingScrollIdRef.current = null;
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [pres]);

  function triggerUpload(accept: string, onUploaded: (fileId: string) => void) {
    if (!fileInputRef.current || !pres) return;
    uploadContextRef.current = { onUploaded };
    fileInputRef.current.accept = accept;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  /** Open the thumbnail picker to re-use an existing project file.
   *  Pass `{ multiSelect: true }` to let the admin choose several at
   *  once — useful for building a carousel. */
  function triggerPicker(
    accept: string,
    title: string,
    onPick: (fileIds: string[]) => void,
    opts?: { multiSelect?: boolean }
  ) {
    setPicker({ accept, title, onPick, multiSelect: opts?.multiSelect ?? false });
  }

  /** Promise-wrapped picker — resolves with the picked fileIds, or null
   *  if the modal was closed without a pick. Single-select for now. */
  function triggerPickerAsync(
    accept: string,
    title: string
  ): Promise<string[] | null> {
    let resolved = false;
    return new Promise((resolve) => {
      setPicker({
        accept,
        title,
        multiSelect: false,
        onPick: (ids) => {
          if (resolved) return;
          resolved = true;
          resolve(ids);
        },
        onCancel: () => {
          if (resolved) return;
          resolved = true;
          resolve(null);
        },
      });
    });
  }

  /** Multi-select Promise-wrapped picker — same semantics as
   *  triggerPickerAsync but returns every checked fileId. Used by the
   *  bulk-add-panoramas flow to batch-create sections. */
  function triggerPickerAsyncMulti(
    accept: string,
    title: string
  ): Promise<string[] | null> {
    let resolved = false;
    return new Promise((resolve) => {
      setPicker({
        accept,
        title,
        multiSelect: true,
        onPick: (ids) => {
          if (resolved) return;
          resolved = true;
          resolve(ids);
        },
        onCancel: () => {
          if (resolved) return;
          resolved = true;
          resolve(null);
        },
      });
    });
  }

  async function handleFileUpload(file: File) {
    if (!pres) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      // Flag so the project's file tree / carousel stays clean —
      // this upload is for the presentation only.
      formData.append("isPresentationAsset", "true");

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
        panoramaFloorWatermark,
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

  /** One-shot "give me a tour-ready deck" flow. Opens the picker in
   *  multi-select + upload mode; whatever the admin uploads / picks
   *  becomes one panorama section each, all in parallel. Mirrors the
   *  3D-Vista workflow where you batch-import your shots and only
   *  then start wiring hotspots between them. */
  async function handleBulkAddPanoramas() {
    if (!pres || bulkAddingPanoramas) return;
    setBulkAddingPanoramas(true);
    try {
      const ids = await triggerPickerAsyncMulti(
        "image/*",
        "Upload or pick panoramas to add"
      );
      if (!ids || ids.length === 0) return;

      // Skip files that already back a panorama section in this deck
      // so re-running the flow with the same shots doesn't pile up
      // duplicates. (The single-add path uses the same guard.)
      const existingFileIds = new Set(
        pres.sections
          .filter((s) => s.type === "panorama" && s.fileId)
          .map((s) => s.fileId as string)
      );
      const fresh = ids.filter((id) => !existingFileIds.has(id));
      const skipped = ids.length - fresh.length;

      if (fresh.length === 0) {
        toast.success(
          `All ${ids.length} panoramas were already in this presentation`
        );
        return;
      }

      // Parallel POST — the server assigns order based on the current
      // section count, so racing creates can end up with the same
      // order. To keep the ordering predictable, do them sequentially.
      let added = 0;
      let failed = 0;
      for (const fileId of fresh) {
        try {
          const res = await fetch(
            `/api/presentations/${params.id}/sections`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "panorama", fileId }),
            }
          );
          if (res.ok) {
            added += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }

      await load();

      if (failed === 0) {
        const skipMsg = skipped > 0 ? ` (${skipped} already in deck)` : "";
        toast.success(`Added ${added} panorama${added === 1 ? "" : "s"}${skipMsg}`);
      } else if (added > 0) {
        toast.error(
          `Added ${added}, but ${failed} failed — try those again`
        );
      } else {
        toast.error("Failed to add panoramas");
      }
    } finally {
      setBulkAddingPanoramas(false);
    }
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

  /** Effective list of image fileIds for an image section. Falls back to
   *  the legacy single `fileId` when metadata.fileIds hasn't been seeded. */
  function sectionImageIds(section: SectionRow): string[] {
    const meta = section.metadata as Record<string, unknown> | null;
    if (meta && Array.isArray(meta.fileIds)) {
      const ids = (meta.fileIds as unknown[]).filter(
        (x): x is string => typeof x === "string"
      );
      if (ids.length > 0) return ids;
    }
    return section.fileId ? [section.fileId] : [];
  }

  async function appendImageToSection(section: SectionRow, fileId: string) {
    await appendImagesToSection(section, [fileId]);
  }

  // Use server-side atomic appendFileIds so fast successive clicks can't
  // race. The server reads the fresh section, merges the new ids, and
  // keeps section.fileId in sync with the first id in the list.
  async function appendImagesToSection(section: SectionRow, fileIds: string[]) {
    if (fileIds.length === 0) return;
    await handleUpdateSection(section.id, { appendFileIds: fileIds });
  }

  async function removeImageFromSection(section: SectionRow, fileId: string) {
    await handleUpdateSection(section.id, { removeFileIds: [fileId] });
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

  /** Friendly label for a panorama section — used as the auto-generated
   *  navigation hotspot label when the admin drag-links two rooms. */
  function panoramaLabel(s: SectionRow): string {
    const meta = (s.metadata || {}) as PanoramaMetadata;
    const roomLabel = meta.roomLabel?.trim();
    if (roomLabel) return roomLabel;
    if (s.title?.trim()) return s.title.trim();
    const fromFile = s.file?.originalName?.replace(/\.[^.]+$/, "");
    if (fromFile) return fromFile;
    return `Panorama ${s.id.slice(0, 6)}`;
  }

  /** Auto-create a *reverse* navigation hotspot on the dropped-onto
   *  panorama so the two rooms are wired together in both directions
   *  — the magic part of the drag-to-link UX from 3D Vista.
   *
   *  Heuristic for the reverse hotspot's location: flip the forward
   *  yaw by 180° (you walked in through that door, you walk out the
   *  same way). It's a sensible default the admin can nudge later.
   *  Pitch is preserved so it lines up roughly with floor level. */
  async function linkPanoramasReverse(args: {
    fromSectionId: string;
    toSectionId: string;
    forwardPitch: number;
    forwardYaw: number;
  }) {
    if (!pres) return;
    const target = pres.sections.find((s) => s.id === args.toSectionId);
    const source = pres.sections.find((s) => s.id === args.fromSectionId);
    if (!target || !source) return;

    const targetMeta = (target.metadata as PanoramaMetadata) || {};
    const existingReverse = (targetMeta.hotspots ?? []).find(
      (h) =>
        h.type === "navigation" && h.targetSectionId === args.fromSectionId
    );
    if (existingReverse) {
      // Already wired the other way — don't add a duplicate. The
      // forward direction will still get saved (already happened in
      // the editor), so the cross-link is complete.
      return;
    }

    // Normalize yaw flip to (-180, 180] which matches Pannellum's
    // canonical range and avoids accumulating wraps.
    const flippedYawRaw = args.forwardYaw + 180;
    const flippedYaw = ((flippedYawRaw + 180) % 360 + 360) % 360 - 180;

    const reverseHotspot: import("@/types/panorama").NavigationHotspot = {
      id: crypto.randomUUID(),
      type: "navigation",
      pitch: args.forwardPitch,
      yaw: flippedYaw,
      label: panoramaLabel(source),
      targetSectionId: args.fromSectionId,
    };

    const nextMeta: PanoramaMetadata = {
      ...targetMeta,
      hotspots: [...(targetMeta.hotspots ?? []), reverseHotspot],
    };

    // Use the same PATCH path the editor uses for its own saves.
    try {
      const res = await fetch(
        `/api/presentations/${params.id}/sections/${args.toSectionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: nextMeta }),
        }
      );
      if (!res.ok) {
        toast.error("Linked one way, but the return hotspot failed to save");
      }
    } catch {
      toast.error("Linked one way, but the return hotspot failed to save");
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
          {/* Floor Plan map — 3D Vista style. Reuses each panorama's
              metadata.floorPlan, so dropping a thumbnail onto the plan
              writes that pano's marker. Only shows if there's at least
              one panorama in the deck. */}
          {sections.some((s) => s.type === "panorama" && s.fileId) && (
            <PresentationFloorPlanMap
              sections={sections.map((s) => ({
                id: s.id,
                type: s.type,
                title: s.title,
                fileId: s.fileId,
                metadata: s.metadata,
                file: s.file
                  ? { id: s.file.id, originalName: s.file.originalName }
                  : null,
              }))}
              projectFiles={projectFiles}
              onUpdateSectionMetadata={async (sectionId, metadata) => {
                await handleUpdateSection(sectionId, { metadata });
              }}
              onPickFloorPlan={async () => {
                const ids = await triggerPickerAsync(
                  "image/*",
                  "Pick a floor plan image"
                );
                return ids?.[0] ?? null;
              }}
            />
          )}

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
                  <div key={section.id} data-section-id={section.id}>
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
                              onClick={() =>
                                triggerPicker("image/*", "Pick a hero image", (ids) =>
                                  handleUpdateSection(section.id, { fileId: ids[0] })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Browse project images"
                            >
                              <Images className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() =>
                                triggerUpload("image/*", (fileId) =>
                                  handleUpdateSection(section.id, { fileId })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Upload a new hero image (stays private to this presentation)"
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            Background image for the hero slide · Browse project · Upload new (presentation-only)
                          </p>
                        </div>
                      )}

                      {/* Editable fields per type */}
                      {(section.type === "image" ||
                        section.type === "video" ||
                        section.type === "panorama") && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {section.type === "image" ? (() => {
                            const ids = sectionImageIds(section);
                            return (
                              <div className="sm:col-span-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {ids.map((id) => {
                                    const f = projectFiles.find((pf) => pf.id === id);
                                    return (
                                      <div
                                        key={id}
                                        title={f?.originalName || ""}
                                        className="group relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.05]"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={`/api/files/${id}/download?inline=true`}
                                          alt=""
                                          loading="lazy"
                                          className="h-full w-full object-cover"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeImageFromSection(section, id)}
                                          className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/80"
                                          title="Remove"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerPicker(
                                        "image/*",
                                        "Pick images for this carousel",
                                        (ids) => appendImagesToSection(section, ids),
                                        { multiSelect: true }
                                      )
                                    }
                                    className="h-14 w-20 flex-shrink-0 rounded-lg border border-dashed border-white/[0.15] bg-white/[0.02] text-slate-400 hover:border-brand-500/50 hover:text-brand-300 transition-colors flex flex-col items-center justify-center gap-0.5"
                                    title="Browse project images (multi-select)"
                                  >
                                    <Images className="h-3.5 w-3.5" />
                                    <span className="text-[10px]">Browse</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={uploading}
                                    onClick={() =>
                                      triggerUpload("image/*", (fileId) =>
                                        appendImageToSection(section, fileId)
                                      )
                                    }
                                    className="h-14 w-20 flex-shrink-0 rounded-lg border border-dashed border-white/[0.15] bg-white/[0.02] text-slate-400 hover:border-brand-500/50 hover:text-brand-300 transition-colors flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
                                    title="Upload new (presentation-only)"
                                  >
                                    {uploading ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="h-3.5 w-3.5" />
                                    )}
                                    <span className="text-[10px]">Upload</span>
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">
                                  {ids.length >= 2
                                    ? `${ids.length} images — renders as a carousel`
                                    : ids.length === 1
                                      ? "1 image — add more to make this a carousel"
                                      : "No images yet — Browse or Upload to add"}
                                </p>
                              </div>
                            );
                          })() : (
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
                                  .filter((f) =>
                                    section.type === "video"
                                      ? f.mimeType.startsWith("video/")
                                      : f.mimeType.startsWith("image/")
                                  )
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.originalName}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const accept = section.type === "video" ? "video/*" : "image/*";
                                  const title = section.type === "video"
                                    ? "Pick a video"
                                    : "Pick a 360° image";
                                  triggerPicker(accept, title, (ids) =>
                                    handleUpdateSection(section.id, { fileId: ids[0] })
                                  );
                                }}
                                className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                                title="Browse project files"
                              >
                                <Images className="h-3.5 w-3.5" />
                              </button>
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
                                title="Upload new (presentation-only)"
                              >
                                {uploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          )}
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
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            defaultValue={section.title || ""}
                            placeholder="Title (e.g. Chapter II — The Conservatory)"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                title: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none sm:col-span-2"
                          />
                          <input
                            type="text"
                            defaultValue={section.description || ""}
                            placeholder="Description (optional) — a sentence or two"
                            onBlur={(e) =>
                              handleUpdateSection(section.id, {
                                description: e.target.value || null,
                              })
                            }
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none sm:col-span-2"
                          />
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
                            className="block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-xs text-white [&>option]:text-black focus:border-brand-500 focus:outline-none sm:col-span-2"
                          >
                            {AMBIENT_STYLES.map((s) => (
                              <option key={s.value} value={s.value}>
                                Ambient: {s.label}
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
                              onClick={() =>
                                triggerPicker(
                                  "model/*",
                                  "Pick a 3D model",
                                  (ids) =>
                                    handleUpdateSection(section.id, { fileId: ids[0] })
                                )
                              }
                              className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-colors"
                              title="Browse project files"
                            >
                              <Images className="h-3.5 w-3.5" />
                            </button>
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
                              title="Upload new (presentation-only)"
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
                        onAddPanorama={async () => {
                          // Open the picker, let the admin browse or
                          // upload. If a panorama section for this file
                          // already exists in the presentation, reuse
                          // it (auto-select in the dropdown) instead of
                          // creating a duplicate. Otherwise, create a
                          // new panorama section and return its id.
                          const ids = await triggerPickerAsync(
                            "image/*",
                            "Pick a 360° panorama for the new room"
                          );
                          const fileId = ids?.[0];
                          if (!fileId) return null;

                          // Look for an existing panorama section in
                          // this presentation backed by the same file.
                          const existing = pres?.sections.find(
                            (s) =>
                              s.type === "panorama" && s.fileId === fileId
                          );
                          if (existing) {
                            toast.success(
                              "That panorama is already in this presentation — selected it for you"
                            );
                            return existing.id;
                          }

                          try {
                            const res = await fetch(
                              `/api/presentations/${params.id}/sections`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  type: "panorama",
                                  fileId,
                                }),
                              }
                            );
                            if (!res.ok) {
                              toast.error("Failed to create panorama section");
                              return null;
                            }
                            const created = await res.json();
                            await load();
                            toast.success("Panorama added");
                            return created?.id ?? null;
                          } catch {
                            toast.error("Something went wrong");
                            return null;
                          }
                        }}
                        onAddFloorPlan={async () => {
                          // Just pick an existing project image — no
                          // section to create. The editor's onChange
                          // wires the picked id into metadata.floorPlan.
                          const ids = await triggerPickerAsync(
                            "image/*",
                            "Pick an image for the floor plan"
                          );
                          return ids?.[0] ?? null;
                        }}
                        onLinkPanorama={async (args) => {
                          // Mirror the forward hotspot into the target
                          // section (one PATCH), then refresh the
                          // dataset so the now-visible editor for the
                          // target shows the new reverse hotspot.
                          await linkPanoramasReverse(args);
                          await load();
                          const sourceLabel = pres?.sections.find(
                            (s) => s.id === args.fromSectionId
                          );
                          const targetLabel = pres?.sections.find(
                            (s) => s.id === args.toSectionId
                          );
                          if (sourceLabel && targetLabel) {
                            toast.success(
                              `Linked ${panoramaLabel(sourceLabel)} ↔ ${panoramaLabel(targetLabel)}`
                            );
                          } else {
                            toast.success("Rooms linked");
                          }
                        }}
                        onSwitchToPanorama={(targetSectionId) => {
                          // Mark the target so the scroll effect can
                          // bring it into view once it mounts. Then
                          // collapse the current expansion + expand
                          // the target so the admin lands in the
                          // freshly-linked room.
                          pendingScrollIdRef.current = targetSectionId;
                          setExpandedPanoramaId(targetSectionId);
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
            <div className="px-6 py-3 border-t border-white/[0.06] flex flex-wrap items-center gap-2">
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

              <div className="h-4 w-px bg-white/[0.1] mx-1" />

              {/* Bulk panorama add — opens the picker in multi-select +
                  upload mode and creates one panorama section per file
                  in one shot. Designed for the "load all my shots in
                  before wiring hotspots" workflow. */}
              <button
                onClick={handleBulkAddPanoramas}
                disabled={bulkAddingPanoramas}
                title="Upload or pick multiple 360° images at once. Each one becomes its own panorama section."
                className="inline-flex items-center gap-1 rounded-lg border border-white/[0.15] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.06] hover:border-white/[0.25] disabled:opacity-50 transition-colors"
              >
                {bulkAddingPanoramas ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Bulk add panoramas
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
              {watermarkEnabled && (
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="panorama-floor-watermark"
                    checked={panoramaFloorWatermark}
                    onChange={(e) =>
                      setPanoramaFloorWatermark(e.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-600 focus:ring-brand-500"
                  />
                  <label
                    htmlFor="panorama-floor-watermark"
                    className="text-sm text-slate-300"
                  >
                    Floor watermark on 360° panoramas
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Composites the logo onto the floor at view-time so it
                      reads flat — no distorted corner stamp on the sphere.
                    </span>
                  </label>
                </div>
              )}
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

      {picker && pres && (
        <FilePickerModal
          projectId={pres.project.id}
          accept={picker.accept}
          title={picker.title}
          multiSelect={picker.multiSelect}
          onPick={picker.onPick}
          onClose={() => {
            if (picker.onCancel) picker.onCancel();
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
