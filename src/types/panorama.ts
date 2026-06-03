// Panorama 360° Walkthrough Types

export interface PanoramaMetadata {
  initialView?: { pitch: number; yaw: number; hfov?: number };
  hotspots?: PanoramaHotspot[];
  floorPlan?: {
    imageFileId: string;
    markerX: number; // 0-1 normalized position on floor plan
    markerY: number;
    /** Optional. The pano yaw (in degrees) that corresponds to "up"
     *  on the floor plan image. Calibration: in the editor the
     *  admin pans the panorama until they're looking in the
     *  direction they want to read as "north" on the plan (e.g.
     *  facing the building's front), then clicks Set North — we
     *  capture viewer.getYaw() into this field. At view time the
     *  heading arrow rotates by `currentYaw - northYaw` so it
     *  matches real-world orientation.
     *
     *  When unset, the arrow rotates by raw yaw — which works
     *  fine for panoramas shot facing "plan north" but reads the
     *  wrong way for any pano captured at a different rotation. */
    northYaw?: number;
  };
  roomLabel?: string;
  tourGroupId?: string;
}

export type PanoramaHotspot = NavigationHotspot | InfoHotspot;

export interface NavigationHotspot {
  id: string;
  type: "navigation";
  pitch: number;
  yaw: number;
  label: string;
  targetSectionId: string;
}

export interface InfoHotspot {
  id: string;
  type: "info";
  pitch: number;
  yaw: number;
  label: string;
  content: InfoContent;
}

export type InfoContent =
  | { type: "text"; title: string; body: string }
  | { type: "image"; fileId: string; caption?: string }
  | { type: "video"; url: string }
  | { type: "pdf"; fileId: string; title?: string };

// Type guards
export function isNavigationHotspot(
  hotspot: PanoramaHotspot
): hotspot is NavigationHotspot {
  return hotspot.type === "navigation";
}

export function isInfoHotspot(
  hotspot: PanoramaHotspot
): hotspot is InfoHotspot {
  return hotspot.type === "info";
}
