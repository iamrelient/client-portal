import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";
import { applyFloorWatermark, isWatermarkable } from "@/lib/watermark";
import { isPanoramaAspect } from "@/lib/pano-utils";
import { buildViewerDerivative } from "@/lib/image-derivatives";
import sharp from "sharp";

// Floor-watermarking buffers the entire image in memory and runs sharp,
// which can take a few seconds on an 8K panorama (more on 16K). On
// Vercel Pro 120s gives comfortable headroom without holding a client
// connection open longer than necessary.
export const maxDuration = 120;

export async function GET(
  _req: Request,
  { params }: { params: { token: string; fileId: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
      include: { project: { select: { watermarkEnabled: true } } },
    });

    if (!presentation || !presentation.isActive) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json(
        { error: "This presentation has expired" },
        { status: 403 }
      );
    }

    // Verify password cookie if password-protected
    if (presentation.password) {
      const cookieStore = cookies();
      const authCookie = cookieStore.get(`pres_${presentation.id}`);

      if (!authCookie || authCookie.value !== presentation.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Verify this file belongs to the presentation. Several places
    // can reference it:
    //   • clientLogo                  (one off, presentation-level)
    //   • tourHeroFileId              (cover image for the tour slide)
    //   • a section's fileId          (primary content)
    //   • a section's metadata blob   (hotspot images, PDFs, legacy
    //                                  per-pano floorPlan)
    //   • tourRooms[].floorPlanImageFileId
    //                                 (current per-room floor plans)
    // The blob checks are tolerant string-includes scans rather than
    // structured parses — picks up new metadata shapes without
    // having to keep the allowlist in lockstep with every UI change.
    const isClientLogo = presentation.clientLogo === params.fileId;
    const isTourHero = presentation.tourHeroFileId === params.fileId;

    if (!isClientLogo && !isTourHero) {
      const section = await prisma.presentationSection.findFirst({
        where: {
          presentationId: presentation.id,
          fileId: params.fileId,
        },
      });

      if (!section) {
        // Check section metadata blobs — covers hotspot images,
        // hotspot PDFs, and legacy per-pano floorPlan references.
        const allSections = await prisma.presentationSection.findMany({
          where: { presentationId: presentation.id },
          select: { id: true, metadata: true },
        });

        const inSectionMetadata = allSections.some((s) => {
          if (!s.metadata) return false;
          const metaStr = JSON.stringify(s.metadata);
          return metaStr.includes(params.fileId);
        });

        // Check the presentation-level tourRooms blob — current
        // home for per-room floor plan file ids after the refactor.
        let inTourRooms = false;
        if (!inSectionMetadata && presentation.tourRooms) {
          const blob = JSON.stringify(presentation.tourRooms);
          inTourRooms = blob.includes(params.fileId);
        }

        if (!inSectionMetadata && !inTourRooms) {
          return NextResponse.json(
            { error: "File not found in presentation" },
            { status: 404 }
          );
        }
      }
    }

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Build the Cache-Control header once for reuse on all serve paths.
    // For password-protected presentations we keep things private — the
    // password is a real access control and shared edge caches would
    // bypass it. Everything else is safe to cache on Vercel's edge
    // because the access token is already part of the URL: only people
    // with the token can hit the cache key. The result is dramatically
    // faster panorama loads after the first viewer warms the cache (a
    // 25 MB panorama goes from a 2–5 s Drive round-trip to a ~50 ms
    // edge hit). Browsers also keep their own copy for an hour.
    const cacheControl = presentation.password
      ? "private, max-age=3600, immutable"
      : "public, s-maxage=86400, max-age=3600, immutable";

    // ── Fast path: serve the pre-baked viewer derivative ──
    // Built at upload time (see lib/image-derivatives.ts): downscaled
    // to ≤4K wide, watermark already composited in, re-encoded as a
    // tight JPEG. Zero Sharp work at serve time, ~1-3 MB instead of
    // 50-100 MB for an 8K panorama. We respect the presentation's
    // watermark kill switches by falling back to the original (slow
    // path) when the admin wants the clean version of a file whose
    // derivative carries a baked-in watermark.
    const wantsWatermark =
      presentation.project.watermarkEnabled &&
      presentation.watermarkEnabled &&
      (file.isPanorama ? presentation.panoramaFloorWatermark : true);
    const derivativeMatchesIntent =
      file.viewerHasWatermark === wantsWatermark;

    if (file.viewerDriveFileId && derivativeMatchesIntent) {
      const { stream: viewerStream } = await downloadFile(
        file.viewerDriveFileId
      );
      return new NextResponse(viewerStream, {
        headers: {
          "Content-Type": file.viewerMimeType || file.mimeType,
          "Content-Disposition": `inline; filename="${file.originalName}"`,
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
          // Tag so we can see in network panel which path was hit.
          "X-Asset-Path": "viewer-derivative",
        },
      });
    }

    const { stream } = await downloadFile(file.path);

    // ── Panorama without a stored derivative: downscale on the fly ──
    // CRITICAL for fresh uploads: most GPUs cap WebGL textures at
    // 4096px, so handing Pannellum a raw 6K equirectangular makes the
    // scene fail to load — the tour appears to "kick back" to the entry
    // room because the new scene never becomes ready. The fast path
    // above serves the pre-baked ≤4K derivative, but that's generated
    // fire-and-forget after upload, so for a few seconds (or if that
    // job failed) there's no derivative. Rather than stream the
    // un-renderable original, downscale (and floor-watermark, if
    // enabled) to a viewer-safe JPEG here. The CDN edge-caches the
    // result, so only the first viewer pays; once generate-viewer
    // finishes, the fast path takes over. Gated on isPanorama so plain
    // carousel/lightbox images stay a cheap full-res passthrough.
    if (file.isPanorama) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const original = Buffer.concat(chunks);
      try {
        const onTheFly = await buildViewerDerivative(original, file.mimeType, {
          isPanorama: true,
          watermark: wantsWatermark,
        });
        const out = onTheFly?.buffer ?? original;
        const outMime = onTheFly?.mimeType ?? file.mimeType;
        const body = out.buffer.slice(
          out.byteOffset,
          out.byteOffset + out.byteLength
        ) as ArrayBuffer;
        return new NextResponse(body, {
          headers: {
            "Content-Type": outMime,
            "Content-Disposition": `inline; filename="${file.originalName}"`,
            "Content-Length": String(out.length),
            "Cache-Control": cacheControl,
            "X-Content-Type-Options": "nosniff",
            "X-Asset-Path": onTheFly
              ? "on-the-fly-derivative"
              : "passthrough-pano",
          },
        });
      } catch (err) {
        console.error(
          "On-the-fly panorama derivative failed; serving original:",
          err
        );
        const body = original.buffer.slice(
          original.byteOffset,
          original.byteOffset + original.byteLength
        ) as ArrayBuffer;
        return new NextResponse(body, {
          headers: {
            "Content-Type": file.mimeType,
            "Content-Disposition": `inline; filename="${file.originalName}"`,
            "Content-Length": String(original.length),
            "Cache-Control": cacheControl,
            "X-Content-Type-Options": "nosniff",
            "X-Asset-Path": "passthrough-pano",
          },
        });
      }
    }

    // ── Slow path: per-serve floor watermark for legacy files ──
    // Only kicks in for files without a baked derivative — older
    // uploads, or fresh ones whose derivative-build failed. We
    // buffer the bytes, run Sharp, and return. For 8K panoramas
    // this can take 5–15 s on cold start; the CDN cache amortizes
    // it across subsequent viewers.
    const watermarkingPossible =
      presentation.project.watermarkEnabled &&
      presentation.watermarkEnabled &&
      presentation.panoramaFloorWatermark &&
      isWatermarkable(file.mimeType);

    if (watermarkingPossible) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const original = Buffer.concat(chunks);

      // file.isPanorama may be false for legacy uploads (pre-flag) or
      // for files uploaded via paths that didn't detect aspect. Re-check
      // here from the actual buffer and self-heal the DB so future
      // serves can short-circuit if we ever skip the buffer step again.
      let actuallyPanorama: boolean = file.isPanorama;
      if (!actuallyPanorama) {
        try {
          const meta = await sharp(original).metadata();
          if (meta.width && meta.height && isPanoramaAspect(meta.width, meta.height)) {
            actuallyPanorama = true;
            prisma.file
              .update({ where: { id: file.id }, data: { isPanorama: true } })
              .catch(() => {});
          }
        } catch {
          /* not a sharp-readable image — skip */
        }
      }

      const outBuf = actuallyPanorama
        ? await applyFloorWatermark(original, file.mimeType)
        : original;
      const body = outBuf.buffer.slice(
        outBuf.byteOffset,
        outBuf.byteOffset + outBuf.byteLength
      ) as ArrayBuffer;
      return new NextResponse(body, {
        headers: {
          "Content-Type": file.mimeType,
          "Content-Disposition": `inline; filename="${file.originalName}"`,
          "Content-Length": String(outBuf.length),
          "Cache-Control": cacheControl,
          "X-Content-Type-Options": "nosniff",
          "X-Asset-Path": "serve-time-watermark",
        },
      });
    }

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.originalName}"`,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
        "X-Asset-Path": "passthrough",
      },
    });
  } catch (error) {
    console.error("Serve presentation asset error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
