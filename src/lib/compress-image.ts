/**
 * Compress an image file client-side using Canvas.
 * - PNG inputs stay PNG (lossless, preserves transparency — no quality loop).
 * - Everything else is encoded as JPEG with a quality ladder until under the size cap.
 * Returns a File under the target size (default 2MB) when possible.
 */
export async function compressImage(
  file: File,
  maxDimension = 1200,
  maxSizeBytes = 2 * 1024 * 1024
): Promise<File> {
  // Skip if already small enough
  if (file.size <= maxSizeBytes) return file;

  const isPng = file.type === "image/png";

  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (isPng) {
    // Lossless — single encode, preserve alpha, keep .png extension.
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const newName = /\.png$/i.test(file.name)
      ? file.name
      : file.name.replace(/\.\w+$/, ".png");
    return new File([blob], newName, { type: "image/png" });
  }

  // JPEG: try decreasing quality until under target size
  let quality = 0.85;
  let blob: Blob;

  do {
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    quality -= 0.1;
  } while (blob.size > maxSizeBytes && quality > 0.3);

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}
