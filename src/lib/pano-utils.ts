/**
 * Helpers for detecting 360° equirectangular panoramas.
 *
 * Equirectangular panoramas encode a full sphere onto a 2:1 rectangle
 * (width == 2 × height). We accept a small tolerance in case a camera
 * produces 5792×2896 (~2.0) or 7680×3840 (~2.0) with slight rounding.
 */

export function isPanoramaAspect(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return ratio >= 1.9 && ratio <= 2.1;
}

/**
 * Client-side: measure an image File's natural dimensions in the browser
 * and return true if it looks like an equirectangular panorama.
 * Returns false for non-images (videos, PDFs, etc.) or on decode errors.
 */
export async function detectPanoramaFromFile(file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(isPanoramaAspect(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}
