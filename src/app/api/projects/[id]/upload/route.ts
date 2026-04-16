import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToFolder } from "@/lib/google-drive";
import { applyWatermark } from "@/lib/watermark";
import { FileCategory } from "@prisma/client";
import { randomBytes } from "crypto";

// Allow longer execution for large file uploads
export const maxDuration = 60;

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
      select: { id: true, name: true, driveFolderId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as globalThis.File | null;
    const category = ((formData.get("category") as string) || "OTHER") as FileCategory;
    const displayName = formData.get("displayName") as string | null;
    const targetFileGroupId = formData.get("targetFileGroupId") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const fileName = file.name;
    const mimeType = file.type || "application/octet-stream";
    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes);

    // Apply watermark to images before uploading
    const buffer = await applyWatermark(rawBuffer, mimeType);

    // Upload to Google Drive server-side
    const driveResult = await uploadFileToFolder(
      project.driveFolderId,
      fileName,
      mimeType,
      buffer
    );

    const driveFileId = driveResult.id;
    const resolvedSize = Number(driveResult.size) || buffer.length;

    // Version detection: use targetFileGroupId (drag-to-iterate) or fall back to name matching
    let existingFiles;
    if (targetFileGroupId) {
      existingFiles = await prisma.file.findMany({
        where: { fileGroupId: targetFileGroupId },
        orderBy: { version: "desc" },
      });
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

    if (existingFiles && existingFiles.length > 0) {
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
          size: resolvedSize,
          mimeType,
          path: driveFileId,
          driveFileId,
          uploadedById: session.user.id,
          projectId: params.id,
          category,
          displayName: displayName || null,
          version,
          fileGroupId,
          isCurrent: true,
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

    return NextResponse.json(
      { message: "File uploaded", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
