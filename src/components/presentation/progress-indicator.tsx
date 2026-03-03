"use client";

interface ProgressIndicatorProps {
  progress: number;
}

export function ProgressIndicator({ progress }: ProgressIndicatorProps) {
  return (
    <>
      {/* Desktop: vertical line on right edge */}
      <div
        className="fixed right-3 top-0 bottom-0 w-[2px] z-50 hidden md:block pointer-events-none"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="w-full origin-top transition-transform duration-150 ease-out"
          style={{
            height: "100%",
            backgroundColor: "rgba(255,255,255,0.2)",
            transform: `scaleY(${progress})`,
          }}
        />
      </div>

      {/* Mobile: horizontal line at bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 h-[2px] z-50 md:hidden pointer-events-none"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full origin-left transition-transform duration-150 ease-out"
          style={{
            width: "100%",
            backgroundColor: "rgba(255,255,255,0.2)",
            transform: `scaleX(${progress})`,
          }}
        />
      </div>
    </>
  );
}
