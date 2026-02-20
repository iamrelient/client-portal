export const PROJECT_STATUSES = [
  { value: "concept", label: "Concept" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "revisions", label: "Revisions" },
  { value: "complete", label: "Complete" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export function getStatusLabel(status: string): string {
  const found = PROJECT_STATUSES.find((s) => s.value === status);
  return found ? found.label : status;
}

export function getStatusIndex(status: string): number {
  return PROJECT_STATUSES.findIndex((s) => s.value === status);
}
