"use client";

import { useState } from "react";

interface BlurImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function BlurImage({ src, alt, className = "" }: BlurImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={`transition-all duration-500 ${
        loaded ? "blur-0 opacity-100 scale-100" : "blur-sm opacity-0 scale-[1.02]"
      } ${className}`}
    />
  );
}
