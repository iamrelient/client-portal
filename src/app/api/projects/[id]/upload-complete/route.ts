import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFilesInFolder } from "@/lib/google-drive";
import { randomBytes } from "crypto";

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

    const { driveFileId: providedDriveFileId, fileName, mimeType, size, category, displayName, targetFileGroupId } = await req.json();

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

    // Version detection: use targetFileGroupId (drag-to-iterate) or fall back to name matching
    let existingFiles;
    if (targetFileGroupId) {
      existingFiles = await prisma.file.findMany({
        where: { fileGroupId: targetFileGroupId },
        orderBy: { version: "desc" },
      });
    } else {
      existingFiles = await prisma.file.findMany({
        where: { projectId: params.id, originalName: { equals: fileName, mode: "insensitive" } },
        orderBy: { version: "desc" },
      });
    }

    let version = 1;
    let fileGroupId: string | null = null;

    if (existingFiles.length > 0) {
      version = existingFiles[0].version + 1;

      if (existingFiles[0].fileGroupId) {
        fileGroupId = existingFiles[0].fileGroupId;
      } else {
        fileGroupId = randomBytes(12).toString("hex");
        await prisma.file.update({
          where: { id: existingFiles[0].id },
          data: { fileGroupId },
        });
      }
    }

    const dbFile = await prisma.file.create({
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
        displayName: displayName || null,
        version,
        fileGroupId,
      },
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Uploaded file "${fileName}" to project "${project.name}"`,
        userId: session.user.id,
      },
    });

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
