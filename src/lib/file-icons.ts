import {
  FileText,
  Image,
  Film,
  Music,
  FileSpreadsheet,
  FileCode,
  Box,
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
};

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export function getFileIcon(mimeType: string, fileName?: string): LucideIcon {
  for (const [pattern, icon] of mimeMap) {
    if (pattern.test(mimeType)) return icon;
  }
  if (fileName) {
    const ext = getExtension(fileName);
    if (extIconMap[ext]) return extIconMap[ext][0];
  }
  return File;
}

export function getFileLabel(mimeType: string, fileName?: string): string {
  for (const [pattern, , label] of mimeMap) {
    if (pattern.test(mimeType)) return label;
  }
  if (fileName) {
    const ext = getExtension(fileName);
    if (extIconMap[ext]) return extIconMap[ext][1];
  }
  return "File";
}
