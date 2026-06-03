import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFilesInFolder, uploadFileToFolder, downloadFile, updateFileContent } from "@/lib/google-drive";
import { applyWatermark, isWatermarkable } from "@/lib/watermark";
import {
  buildViewerDerivative,
  viewerDerivativeFilename,
} from "@/lib/image-derivatives";
import { sendInspirationNotification } from "@/lib/email";
import { randomBytes } from "crypto";

// Derivative generation can take 10–30 s for an 8K panorama
// (download from Drive + Sharp downscale + watermark + upload back).
// 300 s is the Vercel Pro hard cap on regular functions and gives
// plenty of headroom for the largest reasonable input.
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, driveFolderId: true, watermarkEnabled: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await req.json();

    // ── URL shortcut upload (server-side) ──
    if (body.url) {
      const { url, displayName, notes, category, boardType } = body;

      if (!project.driveFolderId) {
        return NextResponse.json(
          { error: "Project has no Drive folder" },
          { status: 400 }
        );
      }

      let domain = displayName || url;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {}

      const urlFileName = `${domain}.url`;
      const content = `[InternetShortcut]\nURL=${url}\n`;
      const buffer = Buffer.from(content, "utf-8");

      const driveResult = await uploadFileToFolder(
        project.driveFolderId,
        urlFileName,
        "application/internet-shortcut",
        buffer
      );

      const dbFile = await prisma.file.create({
        data: {
          name: urlFileName,
          originalName: urlFileName,
          size: buffer.length,
          mimeType: "application/internet-shortcut",
          path: driveResult.id,
          driveFileId: driveResult.id,
          uploadedById: session.user.id,
          projectId: params.id,
          category: category || "DESIGN_INSPIRATION",
          displayName: domain,
          notes: notes || null,
          boardType: boardType || null,
          isCurrent: true,
        },
      });

      await prisma.activity.create({
        data: {
          type: "FILE_UPLOADED",
          description: `Added URL "${domain}" to project "${project.name}"`,
          userId: session.user.id,
        },
      });

      if ((category || "DESIGN_INSPIRATION") === "DESIGN_INSPIRATION") {
        sendInspirationNotification({
          projectName: project.name,
          fileName: domain,
          uploaderName: session.user.name || session.user.email || "Unknown",
          uploaderRole: session.user.role as "ADMIN" | "STAFF" | "USER",
          notes: notes || null,
          projectId: params.id,
        }).catch(() => {});
      }

      return NextResponse.json(
        { message: "URL added", fileId: dbFile.id },
        { status: 201 }
      );
    }

    // ── Standard file upload (client already uploaded to Drive) ──
    const { driveFileId: providedDriveFileId, fileName, mimeType, size, category, customCategory, displayName, targetFileGroupId, notes, boardType: bodyBoardType, isPanorama: bodyIsPanorama, isPresentationAsset: bodyIsPresentationAsset } = body;

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    // If client didn't get a driveFileId back, search Drive for the file
    let driveFileId = providedDriveFileId;
    let resolvedSize = size;

    if (!driveFileId && project.driveFolderId) {
      const driveFiles = await listFilesInFolder(project.driveFolderId);
      // Get existing DB driveFileIds so we can prefer the NEW file (not already in DB)
      const existingDriveIds = new Set(
        (await prisma.file.findMany({
          where: { projectId: params.id, driveFileId: { not: null } },
          select: { driveFileId: true },
        })).map((f) => f.driveFileId)
      );
      const nameMatches = driveFiles.filter((f) => f.name === fileName);
      // Prefer a Drive file that isn't already registered in DB (i.e. the just-uploaded one)
      const match = nameMatches.find((f) => !existingDriveIds.has(f.id)) || nameMatches[0];
      if (match) {
        driveFileId = match.id;
        resolvedSize = resolvedSize || Number(match.size) || 0;
      }
    }

    if (!driveFileId) {
      return NextResponse.json(
        { error: "Could not find uploaded file in Drive" },
        { status: 400 }
      );
    }

    // Apply watermark to images (chunked uploads already landed on Drive)
    const resolvedMimeType = mimeType || "application/octet-stream";
    // Skip corner watermark when:
    //  • The project has watermarking turned off entirely.
    //  • The file is a 360° panorama — it gets a floor-projected
    //    watermark composited at serve time. A baked-in corner
    //    watermark on an equirectangular image gets badly distorted
    //    when wrapped onto a sphere.
    if (
      project.watermarkEnabled &&
      isWatermarkable(resolvedMimeType) &&
      !bodyIsPanorama
    ) {
      try {
        const { stream } = await downloadFile(driveFileId);
        const chunks: Uint8Array[] = [];
        const reader = (stream as ReadableStream<Uint8Array>).getReader();
        let done = false;
        while (!done) {
          const result = await reader.read();
          if (result.value) chunks.push(result.value);
          done = result.done;
        }
        const originalBuf = Buffer.concat(chunks);
        const watermarked = await applyWatermark(originalBuf, resolvedMimeType);
        if (watermarked !== originalBuf) {
          await updateFileContent(driveFileId, resolvedMimeType, watermarked);
          resolvedSize = watermarked.length;
        }
      } catch (wmErr) {
        console.error("Watermark post-process failed (non-fatal):", wmErr);
      }
    }

    // Check if sync already created a record for this driveFileId (race condition)
    const existingByDriveId = driveFileId
      ? await prisma.file.findFirst({
          where: { projectId: params.id, driveFileId },
        })
      : null;

    if (existingByDriveId) {
      // Sync beat us — update the existing record with the correct category
      const resolvedCategory = category || existingByDriveId.category || "OTHER";
      const dbFile = await prisma.file.update({
        where: { id: existingByDriveId.id },
        data: {
          category: resolvedCategory,
          customCategory: customCategory !== undefined ? (customCategory || null) : existingByDriveId.customCategory,
          displayName: displayName || existingByDriveId.displayName,
          notes: notes || existingByDriveId.notes,
          boardType: bodyBoardType || existingByDriveId.boardType,
          uploadedById: session.user.id,
        },
      });

      await prisma.activity.create({
        data: {
          type: "FILE_UPLOADED",
          description: `Uploaded file "${fileName}" to project "${project.name}"`,
          userId: session.user.id,
        },
      });

      if (resolvedCategory === "DESIGN_INSPIRATION") {
        sendInspirationNotification({
          projectName: project.name,
          fileName: displayName || fileName,
          uploaderName: session.user.name || session.user.email || "Unknown",
          uploaderRole: session.user.role as "ADMIN" | "STAFF" | "USER",
          notes: notes || null,
          projectId: params.id,
        }).catch(() => {});
      }

      return NextResponse.json(
        { message: "File registered", fileId: dbFile.id },
        { status: 201 }
      );
    }

    // Version detection: use targetFileGroupId (drag-to-iterate) or fall back to name matching
    let existingFiles;
    if (targetFileGroupId) {
      // First try matching by fileGroupId
      existingFiles = await prisma.file.findMany({
        where: { fileGroupId: targetFileGroupId },
        orderBy: { version: "desc" },
      });
      // If no group found, the targetFileGroupId may be a file ID (first version with no group yet)
      if (existingFiles.length === 0) {
        const targetFile = await prisma.file.findUnique({ where: { id: targetFileGroupId } });
        if (targetFile) {
          existingFiles = [targetFile];
        }
      }
    } else {
      existingFiles = await prisma.file.findMany({
        where: { projectId: params.id, originalName: { equals: fileName, mode: "insensitive" } },
        orderBy: { version: "desc" },
      });
    }

    let version = 1;
    let fileGroupId: string | null = null;
    let ensureGroupId: string | null = null;

    if (existingFiles.length > 0) {
      version = existingFiles[0].version + 1;

      if (existingFiles[0].fileGroupId) {
        fileGroupId = existingFiles[0].fileGroupId;
      } else {
        fileGroupId = randomBytes(12).toString("hex");
        ensureGroupId = existingFiles[0].id;
      }
    }

    const dbFile = await prisma.$transaction(async (tx) => {
      if (ensureGroupId && fileGroupId) {
        await tx.file.update({
          where: { id: ensureGroupId },
          data: { fileGroupId },
        });
      }
      if (fileGroupId) {
        await tx.file.updateMany({
          where: { fileGroupId },
          data: { isCurrent: false },
        });
      }
      return tx.file.create({
        data: {
          name: fileName,
          originalName: fileName,
          size: resolvedSize || 0,
          mimeType: mimeType || "application/octet-stream",
          path: driveFileId,
          driveFileId,
          uploadedById: session.user.id,
          projectId: params.id,
          category: category || "OTHER",
          customCategory: customCategory || null,
          displayName: displayName || null,
          notes: notes || null,
          boardType: bodyBoardType || null,
          version,
          fileGroupId,
          isCurrent: true,
          isPanorama: Boolean(bodyIsPanorama),
          // Lets picker uploads stay scoped to the presentation — they
          // don't clutter the project's main file tree, matching the
          // existing /files single-shot path. Defaults to false for
          // anything that doesn't set the flag.
          isPresentationAsset: Boolean(bodyIsPresentationAsset),
        },
      });
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Uploaded file "${fileName}" to project "${project.name}"`,
        userId: session.user.id,
      },
    });

    // Send email notification for Design Inspiration uploads
    if ((category || "OTHER") === "DESIGN_INSPIRATION") {
      sendInspirationNotification({
        projectName: project.name,
        fileName: displayName || fileName,
        uploaderName: session.user.name || session.user.email || "Unknown",
        uploaderRole: session.user.role as "ADMIN" | "STAFF" | "USER",
        notes: notes || null,
        projectId: params.id,
      }).catch(() => {}); // fire-and-forget
    }

    // ── Viewer-optimized derivative ──
    // Bake watermark + downscale to 4K max once, so the presentation
    // viewer doesn't have to do per-serve Sharp work on huge files.
    // Non-fatal: if anything fails, the asset route falls back to the
    // original + serve-time watermark (legacy path still works).
    //
    // We do this after responding to the DB write so the function
    // can use its full 300 s budget; the client gets the fileId
    // immediately and the viewer derivative shows up when the next
    // refresh happens. Actually — we have to do it before the
    // response so the picker can rely on the derivative existing by
    // the time the asset route fires. Trade-off: longer upload-
    // complete latency (10–30 s for 8K), but no missed cache.
    const resolvedMimeForDerivative =
      mimeType || "application/octet-stream";
    if (isWatermarkable(resolvedMimeForDerivative)) {
      try {
        // Re-download the current Drive content. For non-panoramas
        // this is the just-watermarked buffer; for panoramas it's the
        // raw original (corner watermark was skipped above). Either
        // way, buildViewerDerivative does the right thing:
        //  - panorama + watermark on → bakes floor watermark
        //  - non-panorama + already watermarked → just downscales
        //    (we pass watermark: false to avoid double-stamping)
        const { stream } = await downloadFile(driveFileId);
        const chunks: Uint8Array[] = [];
        const reader = (stream as ReadableStream<Uint8Array>).getReader();
        let done = false;
        while (!done) {
          const r = await reader.read();
          if (r.value) chunks.push(r.value);
          done = r.done;
        }
        const sourceBuf = Buffer.concat(chunks);

        const derivative = await buildViewerDerivative(
          sourceBuf,
          resolvedMimeForDerivative,
          {
            isPanorama: Boolean(bodyIsPanorama),
            // Panoramas: bake floor watermark now (currently per-serve).
            // Non-panoramas: corner watermark already baked into source
            // by the pass above, so the derivative just inherits it.
            watermark:
              Boolean(bodyIsPanorama) && project.watermarkEnabled,
          }
        );

        if (derivative && project.driveFolderId) {
          const viewerDriveResult = await uploadFileToFolder(
            project.driveFolderId,
            viewerDerivativeFilename(fileName),
            derivative.mimeType,
            derivative.buffer
          );

          await prisma.file.update({
            where: { id: dbFile.id },
            data: {
              viewerDriveFileId: viewerDriveResult.id,
              viewerMimeType: derivative.mimeType,
              viewerSize: derivative.buffer.length,
              viewerWidth: derivative.width,
              viewerHeight: derivative.height,
              // For non-panoramas the source already had the corner
              // watermark baked in by the pass above (when project
              // watermarking is on), so the derivative inherits it.
              // For panoramas the derivative carries the floor
              // watermark iff we asked buildViewerDerivative to add one.
              viewerHasWatermark:
                bodyIsPanorama
                  ? derivative.hasWatermark
                  : project.watermarkEnabled,
            },
          });
        }
      } catch (derivErr) {
        // Non-fatal — the asset route will fall back to original +
        // serve-time watermark for this file. Log so we can fix.
        console.error(
          "Viewer derivative generation failed (non-fatal):",
          derivErr
        );
      }
    }

    return NextResponse.json(
      { message: "File registered", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload complete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
