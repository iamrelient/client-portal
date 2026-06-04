// Panorama 360° Walkthrough Types

/** A logical "room" pinned to a floor plan — owned by the
 *  presentation, not the panorama. Multiple panoramas can belong to
 *  the same room (e.g. lobby shot from the entrance + lobby shot
 *  from the reception desk); they share this single map marker.
 *  startingPanoSectionId designates which panorama opens when a
 *  client clicks the room's dot on the minimap. */
export interface TourRoom {
  id: string;
  /** Display name shown on the minimap and in the room list. */
  name: string;
  /** Floor plan image (a project file). Multi-floor buildings can
   *  have rooms anchored to different floor plan images. */
  floorPlanImageFileId: string;
  /** Normalized 0-1 position on the floor plan. */
  markerX: number;
  markerY: number;
  /** Section id of the panorama that opens when this room is
   *  selected from the minimap. Null when the admin hasn't assigned
   *  any pano to the room yet (room is just a placeholder). */
  startingPanoSectionId: string | null;
}

export interface PanoramaMetadata {
  initialView?: { pitch: number; yaw: number; hfov?: number };
  hotspots?: PanoramaHotspot[];
  /** Which TourRoom this panorama lives in. Optional for back-compat
   *  with legacy data that hadn't been migrated yet. */
  roomId?: string;
  /** Optional per-pano yaw offset that aligns the minimap's heading
   *  arrow with the real-world "up" on the floor plan. Captured in
   *  the editor by panning to the desired north and clicking Set
   *  North — viewer.getYaw() lands here. Each pano needs its own
   *  because they were captured at different camera orientations,
   *  even within the same room. */
  northYaw?: number;
  /** @deprecated — Use the presentation's tourRooms instead. Kept
   *  on the type so legacy data still loads, and so the editor can
   *  derive a starter set of tourRooms from any panorama that still
   *  has this set. New data shouldn't write to this field. */
  floorPlan?: {
    imageFileId: string;
    markerX: number;
    markerY: number;
    northYaw?: number;
  };
  /** @deprecated — Display name now lives on section.title. */
  roomLabel?: string;
  /** @deprecated — All panoramas in a presentation are one
   *  walkthrough automatically; tour-group ids no longer matter. */
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
