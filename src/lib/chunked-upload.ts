/**
 * Chunked file upload to Google Drive via server-side proxy.
 *
 * Splits the file into 3.5 MB chunks (Google requires multiples of 256 KB),
 * uploads each through /api/projects/{id}/upload-chunk with automatic retry
 * and exponential backoff. Survives brief network interruptions.
 *
 * Server routes used:
 *   POST /api/projects/{id}/upload-start  → creates Google resumable session
 *   POST /api/projects/{id}/upload-chunk  → forwards each chunk to Google
 */

// Google requires chunks to be multiples of 256 KB (except the last chunk)
// 14 × 256 KB = 3,670,016 bytes (3.5 MB) — safely under Vercel Hobby's 4.5 MB body limit
const CHUNK_SIZE = 14 * 256 * 1024;
const MAX_CHUNK_RETRIES = 3;

export interface ChunkedUploadParams {
  file: File;
  projectId: string;
  onProgress?: (percent: number) => void;
  onRetry?: (attempt: number, maxAttempts: number) => void;
}

export interface ChunkedUploadResult {
  driveFileId: string;
  size: number;
}

export async function chunkedUpload({
  file,
  projectId,
  onProgress,
  onRetry,
}: ChunkedUploadParams): Promise<ChunkedUploadResult> {
  const totalSize = file.size;

  // Step 1: Start upload session (server creates Google resumable session)
  const startRes = await fetch(`/api/projects/${projectId}/upload-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: totalSize,
    }),
  });

  if (!startRes.ok) {
    const data = await startRes
      .json()
      .catch(() => ({ error: "Failed to start upload" }));
    throw new Error(data.error || "Failed to start upload");
  }

  const { uploadUri } = await startRes.json();

  // Step 2: Upload in chunks through the server with retry
  let offset = 0;
  let driveFileId: string | undefined;
  let driveSize: number | undefined;

  while (offset < totalSize) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunkBlob = file.slice(offset, chunkEnd);
    const rangeEnd = chunkEnd - 1; // inclusive byte index

    let chunkSuccess = false;

    for (let retry = 0; retry < MAX_CHUNK_RETRIES; retry++) {
      try {
        const formData = new FormData();
        formData.append("chunk", chunkBlob, "chunk");
        formData.append("uploadUri", uploadUri);
        formData.append("rangeStart", String(offset));
        formData.append("rangeEnd", String(rangeEnd));
        formData.append("totalSize", String(totalSize));

        const chunkRes = await fetch(
          `/api/projects/${projectId}/upload-chunk`,
          { method: "POST", body: formData }
        );

        if (!chunkRes.ok) {
          const errData = await chunkRes
            .json()
            .catch(() => ({ error: "Chunk upload failed" }));
          throw new Error(errData.error || "Chunk upload failed");
        }

        const result = await chunkRes.json();

        if (result.complete) {
          driveFileId = result.driveFileId;
          driveSize = result.size;
        }

        // Update progress
        const progressBytes = result.complete
          ? totalSize
          : result.bytesReceived || chunkEnd;
        onProgress?.(Math.round((progressBytes / totalSize) * 100));

        chunkSuccess = true;
        break;
      } catch (err) {
        console.warn(
          `Chunk at offset ${offset} failed (attempt ${retry + 1}):`,
          err
        );
        if (retry < MAX_CHUNK_RETRIES - 1) {
          // Exponential backoff: 1s, 2s, 3s
          await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
          onRetry?.(retry + 2, MAX_CHUNK_RETRIES);
        } else {
          throw err instanceof Error
            ? err
            : new Error("Upload failed after multiple attempts");
        }
      }
    }

    if (!chunkSuccess) break;
    offset = chunkEnd;
  }

  if (!driveFileId) {
    throw new Error(
      "Upload completed but no file ID was returned from Google Drive"
    );
  }

  return { driveFileId, size: driveSize || totalSize };
}
