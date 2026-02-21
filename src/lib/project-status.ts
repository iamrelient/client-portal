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

const STATUS_COLORS: Record<string, string> = {
  concept: "bg-slate-500/10 text-slate-400",
  in_progress: "bg-blue-500/10 text-blue-400",
  review: "bg-amber-500/10 text-amber-400",
  revisions: "bg-orange-500/10 text-orange-400",
  complete: "bg-green-500/10 text-green-400",
};

export function getStatusColorClass(status: string): string {
  return STATUS_COLORS[status] || "bg-brand-500/10 text-brand-400";
}
