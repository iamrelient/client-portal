"use client";

import { PROJECT_STATUSES, getStatusIndex } from "@/lib/project-status";

interface StatusTimelineProps {
  status: string;
}

export function StatusTimeline({ status }: StatusTimelineProps) {
  const currentIndex = getStatusIndex(status);

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {PROJECT_STATUSES.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isComplete = step.value === "complete" && isCurrent;

        return (
          <div key={step.value} className="flex items-center">
            {/* Connecting line (before circle, except first) */}
            {i > 0 && (
              <div
                className={`h-0.5 w-8 sm:w-12 transition-colors ${
                  isCompleted || isCurrent ? "bg-brand-500" : "bg-white/[0.1]"
                }`}
              />
            )}

            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  isComplete
                    ? "border-green-500 bg-green-500 text-white"
                    : isCurrent
                      ? "border-brand-500 bg-brand-500/20 shadow-[0_0_12px_rgba(74,97,153,0.5)]"
                      : isCompleted
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-white/[0.15] bg-white/[0.03]"
                }`}
              >
                {isCompleted || isComplete ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      isCurrent ? "bg-brand-400" : "bg-white/[0.15]"
                    }`}
                  />
                )}
              </div>
              <span
                className={`whitespace-nowrap text-xs font-medium ${
                  isComplete
                    ? "text-green-400"
                    : isCurrent
                      ? "text-brand-300"
                      : isCompleted
                        ? "text-slate-300"
                        : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
