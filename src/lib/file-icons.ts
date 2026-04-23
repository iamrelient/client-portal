import {
  FileText,
  Image,
  Film,
  Music,
  FileSpreadsheet,
  FileCode,
  Box,
  Globe,
  File,
  type LucideIcon,
} from "lucide-react";

const mimeMap: [RegExp, LucideIcon, string][] = [
  [/^image\//, Image, "Image"],
  [/^video\//, Film, "Video"],
  [/^audio\//, Music, "Audio"],
  [/^application\/pdf$/, FileText, "PDF"],
  [/^model\//, Box, "3D Model"],
  [/spreadsheet|csv|excel|\.sheet/, FileSpreadsheet, "Spreadsheet"],
  [/^text\/html$/, FileCode, "HTML"],
  [/^application\/json$/, FileCode, "JSON"],
  [/^text\/css$/, FileCode, "CSS"],
  [/javascript/, FileCode, "Code"],
  [/^text\//, FileText, "Text"],
];

const extIconMap: Record<string, [LucideIcon, string]> = {
  ".glb": [Box, "3D Model"],
  ".gltf": [Box, "3D Model"],
  ".fbx": [Box, "3D Model"],
  ".obj": [Box, "3D Model"],
  ".url": [Globe, "Website"],
};

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

interface LabelOptions {
  /** When true, the file is a 360° equirectangular panorama and should be
   *  labeled/icon'd as "360" regardless of its mime type. */
  isPanorama?: boolean;
}

export function getFileIcon(
  mimeType: string,
  fileName?: string,
  opts?: LabelOptions
): LucideIcon {
  if (opts?.isPanorama) return Globe;
  for (const [pattern, icon] of mimeMap) {
    if (pattern.test(mimeType)) return icon;
  }
  if (fileName) {
    const ext = getExtension(fileName);
    if (extIconMap[ext]) return extIconMap[ext][0];
  }
  return File;
}

export function getFileLabel(
  mimeType: string,
  fileName?: string,
  opts?: LabelOptions
): string {
  if (opts?.isPanorama) return "360";
  for (const [pattern, , label] of mimeMap) {
    if (pattern.test(mimeType)) return label;
  }
  if (fileName) {
    const ext = getExtension(fileName);
    if (extIconMap[ext]) return extIconMap[ext][1];
  }
  return "File";
}
