export function ProjectThumbnail({
  name,
  className = "",
  compact = false,
}: {
  name: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{
        background: "linear-gradient(135deg, #1e3a5f, #2d6a9f)",
      }}
    >
      {/* Geometric grid overlay */}
      {!compact && (
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      )}

      {/* Project name centered */}
      <span
        className={`relative text-center font-bold leading-tight text-white/90 ${
          compact ? "px-1 text-[7px]" : "px-4 text-lg"
        }`}
      >
        {compact ? name.charAt(0).toUpperCase() : name}
      </span>
    </div>
  );
}
