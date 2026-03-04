// 3D Interactive Floor Plan Types

export interface Model3DMetadata {
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  autoRotateSpeed?: number; // default 0.5
  hotspots?: Model3DHotspot[];
}

export type Model3DHotspot = NavigateHotspot | PreviewHotspot;

export interface NavigateHotspot {
  id: string;
  type: "navigate";
  position: { x: number; y: number; z: number }; // 3D world position
  label: string;
  targetChapter: string; // matches chapter string on sections
}

export interface PreviewHotspot {
  id: string;
  type: "preview";
  position: { x: number; y: number; z: number };
  label: string;
  targetChapter: string;
  previewFileIds: string[]; // up to 3 file IDs for thumbnail previews
}

// Type guards
export function isNavigateHotspot(
  hotspot: Model3DHotspot
): hotspot is NavigateHotspot {
  return hotspot.type === "navigate";
}

export function isPreviewHotspot(
  hotspot: Model3DHotspot
): hotspot is PreviewHotspot {
  return hotspot.type === "preview";
}

export function isModel3DMetadata(meta: unknown): meta is Model3DMetadata {
  return meta !== null && typeof meta === "object";
}
