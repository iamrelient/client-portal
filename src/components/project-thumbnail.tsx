const GRADIENT_PAIRS = [
  ["#1e3a5f", "#2d6a9f"],
  ["#1a3c4d", "#2a7f8f"],
  ["#2b2d5e", "#5b5fc7"],
  ["#1c3f3a", "#2f8f7e"],
  ["#2e1f4e", "#6b4fa0"],
  ["#1f3044", "#3d7ba6"],
  ["#1a2f3d", "#377b8a"],
  ["#2a2046", "#6558a6"],
  ["#1d3d2e", "#3a8a6a"],
  ["#2b1d3e", "#7b4f9a"],
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function ProjectThumbnail({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const hash = hashString(name);
  const [from, to] = GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {/* Geometric grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Frosted circle with initial */}
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
        <span className="text-2xl font-bold text-white/90">{initial}</span>
      </div>
    </div>
  );
}
