import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { uploadFileToFolder } from "@/lib/google-drive";
import { sendInspirationNotification } from "@/lib/email";
import { randomBytes } from "crypto";
import { FileCategory } from "@prisma/client";

// Allow longer execution for large file uploads
export const maxDuration = 60;

/**
 * Server-side proxy upload — fallback when direct browser-to-Google-Drive
 * XHR fails (CORS issues, network instability on large files, etc.).
 *
 * Accepts multipart/form-data with:
 *   file      — the file blob
 *   fileName  — original filename
 *   mimeType  — MIME type
 *   category  — file category (defaults to DESIGN_INSPIRATION)
 *   displayName — optional display name
 *   notes     — optional notes
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, driveFolderId: true, authorizedEmails: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (
      session.user.role !== "ADMIN" &&
      !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileName = (formData.get("fileName") as string) || file?.name;
    const mimeType =
      (formData.get("mimeType") as string) ||
      file?.type ||
      "application/octet-stream";
    const category: FileCategory =
      ((formData.get("category") as string) as FileCategory) || "DESIGN_INSPIRATION";
    const displayName = formData.get("displayName") as string | null;
    const notes = formData.get("notes") as string | null;

    if (!file || !fileName) {
      return NextResponse.json(
        { error: "file and fileName are required" },
        { status: 400 }
      );
    }

    // Convert File to Buffer for the Google Drive upload helper
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Google Drive server-side
    const driveResult = await uploadFileToFolder(
      project.driveFolderId,
      fileName,
      mimeType,
      buffer
    );

    // Version detection
    const existingFiles = await prisma.file.findMany({
      where: {
        projectId: params.id,
        originalName: { equals: fileName, mode: "insensitive" },
      },
      orderBy: { version: "desc" },
    });

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
          size: buffer.length,
          mimeType,
          path: driveResult.id,
          driveFileId: driveResult.id,
          uploadedById: session.user.id,
          projectId: params.id,
          category,
          displayName: displayName || null,
          notes: notes || null,
          version,
          fileGroupId,
          isCurrent: true,
        },
      });
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Added inspiration "${displayName || fileName}" to project "${project.name}"`,
        userId: session.user.id,
      },
    });

    sendInspirationNotification({
      projectName: project.name,
      fileName: displayName || fileName,
      uploaderName: session.user.name || session.user.email || "Unknown",
      uploaderRole: session.user.role as "ADMIN" | "STAFF" | "USER",
      notes: notes || null,
      projectId: params.id,
    }).catch(() => {});

    return NextResponse.json(
      { message: "Inspiration added", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Proxy upload error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

