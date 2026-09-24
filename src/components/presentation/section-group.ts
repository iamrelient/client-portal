/**
 * Which group (chapter) a content section belongs to.
 *
 * The explicit Chapter field wins. When it's empty we fall back to the
 * section's title, so two image sections titled "Exterior" and
 * "Interior" stay separate strips/timeline stops instead of silently
 * merging into one "Gallery" — the editor has both fields, and authors
 * reasonably expect a separately titled section to stay separate.
 * Sections with neither still merge into one untitled group, as before.
 *
 * Every place that groups sections (slide segments, timeline dots,
 * chapter headings, chapter-name navigation) must use this so they
 * agree on where one group ends and the next begins.
 */
export function sectionGroupName(section: {
  chapter?: string | null;
  title?: string | null;
}): string | null {
  return section.chapter?.trim() || section.title?.trim() || null;
}
