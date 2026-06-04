/**
 * Tour Room helpers — derivation, migration, and lookup.
 *
 * "Tour rooms" are logical floor-plan markers that own a name, a
 * position, and a designated starting panorama. They live on the
 * presentation itself (not on individual panorama sections), so
 * editing a marker on the main map updates the room — not whatever
 * panorama happens to be tied to it. Multiple panoramas can share
 * one room (the lobby has three shoot points; one dot on the map).
 *
 * This module bridges the new model with legacy data: presentations
 * that haven't been migrated yet have per-pano `metadata.floorPlan`
 * blobs. `deriveTourRooms` synthesizes a `TourRoom[]` from those so
 * the editor + viewer can render rooms today and the admin's next
 * Save persists the migration.
 */

import type { PanoramaMetadata, TourRoom } from "@/types/panorama";

/** Minimal shape we need from a panorama section to derive rooms. */
export interface PanoSectionLike {
  id: string;
  type: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
  file?: { originalName: string } | null;
}

/** Best-effort friendly label for a panorama — same chain the editor
 *  + viewer use elsewhere. */
function panoramaLabel(s: PanoSectionLike, idx: number): string {
  const meta = (s.metadata || {}) as PanoramaMetadata;
  const roomLabel = meta.roomLabel?.trim();
  if (roomLabel) return roomLabel;
  if (s.title?.trim()) return s.title.trim();
  const fromFile = s.file?.originalName?.replace(/\.[^.]+$/, "");
  if (fromFile) return fromFile;
  return `Room ${idx + 1}`;
}

/** Read tourRooms from a presentation's stored Json blob. Tolerant
 *  of `null`, missing, or malformed entries — returns [] in those
 *  cases. */
export function readTourRooms(stored: unknown): TourRoom[] {
  if (!stored || typeof stored !== "object") return [];
  const obj = stored as Record<string, unknown>;
  const list = obj.rooms;
  if (!Array.isArray(list)) return [];
  return list.filter((r): r is TourRoom => {
    if (!r || typeof r !== "object") return false;
    const x = r as Record<string, unknown>;
    return (
      typeof x.id === "string" &&
      typeof x.name === "string" &&
      typeof x.floorPlanImageFileId === "string" &&
      typeof x.markerX === "number" &&
      typeof x.markerY === "number"
    );
  });
}

/** Auto-create one TourRoom per panorama that still carries legacy
 *  per-pano floorPlan metadata. Used when `tourRooms` is empty so
 *  presentations built before the refactor keep showing on the map
 *  + the next Save persists the rooms into the new model.
 *
 *  Strategy:
 *    - Walk panorama sections in order.
 *    - For every one with `metadata.floorPlan` set, mint a new room
 *      whose position/north come from that pano. Name comes from
 *      panoramaLabel(). startingPanoSectionId = that pano's id.
 *    - Panos without floorPlan don't generate rooms (they're
 *      "unplaced"). Admin can manually assign them later.
 *    - Returns the rooms list AND a sectionRoomMap so callers can
 *      stamp metadata.roomId onto each pano they want migrated. */
export function deriveTourRooms(sections: PanoSectionLike[]): {
  rooms: TourRoom[];
  sectionRoomMap: Map<string, string>; // sectionId → roomId
} {
  const rooms: TourRoom[] = [];
  const sectionRoomMap = new Map<string, string>();

  const panos = sections.filter((s) => s.type === "panorama");
  panos.forEach((s, idx) => {
    const meta = (s.metadata || {}) as PanoramaMetadata;
    const fp = meta.floorPlan;
    if (!fp?.imageFileId) return;

    // Deterministic id derived from section id so re-running
    // derivation doesn't create duplicate rooms. (The first save
    // persists, but if the admin reloads before saving we want
    // stable ids.)
    const roomId = `room_${s.id}`;
    rooms.push({
      id: roomId,
      name: panoramaLabel(s, idx),
      floorPlanImageFileId: fp.imageFileId,
      markerX: fp.markerX,
      markerY: fp.markerY,
      startingPanoSectionId: s.id,
    });
    sectionRoomMap.set(s.id, roomId);
  });

  return { rooms, sectionRoomMap };
}

/** True when no rooms have been authored yet but at least one pano
 *  has legacy floorPlan metadata — the trigger for auto-deriving. */
export function shouldAutoMigrate(
  storedTourRooms: unknown,
  sections: PanoSectionLike[]
): boolean {
  const existing = readTourRooms(storedTourRooms);
  if (existing.length > 0) return false;
  return sections.some((s) => {
    if (s.type !== "panorama") return false;
    const meta = (s.metadata || {}) as PanoramaMetadata;
    return !!meta.floorPlan?.imageFileId;
  });
}

/** Pack tourRooms back into the Json shape we persist on the
 *  presentation. Keeping the wrapper object lets us add sibling
 *  metadata (per-floor settings, room groupings) later without
 *  breaking the schema. */
export function packTourRooms(rooms: TourRoom[]): {
  rooms: TourRoom[];
} {
  return { rooms };
}

/** Quick lookup: which room (if any) does this section belong to?
 *  Checks metadata.roomId first, then falls back to a legacy
 *  scan-by-startingPanoSectionId so unmigrated panos still get
 *  identified for display. */
export function roomForSection(
  sectionId: string,
  sectionMeta: PanoramaMetadata | null | undefined,
  rooms: TourRoom[]
): TourRoom | null {
  const explicit = sectionMeta?.roomId;
  if (explicit) {
    const hit = rooms.find((r) => r.id === explicit);
    if (hit) return hit;
  }
  const legacy = rooms.find((r) => r.startingPanoSectionId === sectionId);
  return legacy ?? null;
}
