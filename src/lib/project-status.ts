export const PROJECT_STATUSES = [
  { value: "concept", label: "Concept" },
  { value: "design", label: "Design" },
  { value: "construction_drawings", label: "Construction Drawings" },
  { value: "awaiting_state_review", label: "Awaiting State Review" },
  { value: "in_construction", label: "In Construction" },
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
  design: "bg-blue-500/10 text-blue-400",
  construction_drawings: "bg-violet-500/10 text-violet-400",
  awaiting_state_review: "bg-amber-500/10 text-amber-400",
  in_construction: "bg-orange-500/10 text-orange-400",
  complete: "bg-green-500/10 text-green-400",
};

export function getStatusColorClass(status: string): string {
  return STATUS_COLORS[status] || "bg-brand-500/10 text-brand-400";
}
