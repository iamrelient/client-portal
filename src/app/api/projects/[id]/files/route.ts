import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFileToFolder } from "@/lib/google-drive";
import { hasStudioAccess } from "@/lib/roles";
import { randomBytes } from "crypto";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || !hasStudioAccess(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const files = await prisma.file.findMany({
      where: {
        projectId: params.id,
        // Presentation-only uploads live on the same project but should be
        // hidden from the project's file list.
        isPresentationAsset: false,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        category: true,
        thumbnailUrl: true,
        isOutdated: true,
        isPanorama: true,
        version: true,
        fileGroupId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Dedupe versioned files: keep only the highest `version` per
    // fileGroupId. Files with no fileGroupId pass through unchanged
    // (single-version files). Every caller wants this — the picker and
    // presentation-editor dropdown should never offer an outdated version.
    const maxVersionByGroup = new Map<string, number>();
    for (const f of files) {
      if (!f.fileGroupId) continue;
      const prev = maxVersionByGroup.get(f.fileGroupId) ?? 0;
      if (f.version > prev) maxVersionByGroup.set(f.fileGroupId, f.version);
    }
    // Preserve the original createdAt-desc ordering by filtering in place.
    const deduped = files.filter((f) =>
      f.fileGroupId ? f.version === maxVersionByGroup.get(f.fileGroupId) : true
    );

    return NextResponse.json(deduped);
  } catch (error) {
    console.error("Project files fetch error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

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
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder. Please reconnect Google Drive." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as globalThis.File | null;
    const isPresentationAsset = formData.get("isPresentationAsset") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await uploadFileToFolder(
      project.driveFolderId,
      file.name,
      file.type || "application/octet-stream",
      buffer
    );

    // Version detection: check for existing files with same name in this project (case-insensitive)
    const existingFiles = await prisma.file.findMany({
      where: { projectId: params.id, originalName: { equals: file.name, mode: "insensitive" } },
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
          name: file.name,
          originalName: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          path: result.id,
          driveFileId: result.id,
          uploadedById: session.user.id,
          projectId: params.id,
          version,
          fileGroupId,
          isCurrent: true,
          isPresentationAsset,
        },
      });
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Uploaded file "${file.name}" to project "${project.name}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "File uploaded", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Project file upload error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
