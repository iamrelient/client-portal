import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listFilesInFolder, isGoogleDriveConnected } from "@/lib/google-drive";
import { randomBytes } from "crypto";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        driveFolderId: true,
        lastSyncedAt: true,
        createdById: true,
      },
    });

    if (!project || !project.driveFolderId) {
      return NextResponse.json({ synced: false });
    }

    // Debounce: skip if synced less than 30 seconds ago
    if (
      project.lastSyncedAt &&
      Date.now() - project.lastSyncedAt.getTime() < 30_000
    ) {
      return NextResponse.json({ synced: false, reason: "debounced" });
    }

    const driveConnected = await isGoogleDriveConnected();
    if (!driveConnected) {
      return NextResponse.json({ synced: false, reason: "not_connected" });
    }

    // List files from Drive folder (excludes subfolders like _assets)
    const driveFiles = await listFilesInFolder(project.driveFolderId);

    // Get current DB files for this project
    const dbFiles = await prisma.file.findMany({
      where: { projectId: params.id },
    });

    const driveFileMap = new Map(driveFiles.map((f) => [f.id, f]));
    const dbDriveIdMap = new Map(
      dbFiles.filter((f) => f.driveFileId).map((f) => [f.driveFileId!, f])
    );

    let changed = false;

    // NEW FILES: in Drive but not in DB
    for (const driveFile of driveFiles) {
      if (!dbDriveIdMap.has(driveFile.id)) {
        // Version detection (case-insensitive to handle name variations)
        const existingFiles = await prisma.file.findMany({
          where: { projectId: params.id, originalName: { equals: driveFile.name, mode: "insensitive" } },
          orderBy: { version: "desc" },
        });

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

        await prisma.file.create({
          data: {
            name: driveFile.name,
            originalName: driveFile.name,
            size: Number(driveFile.size) || 0,
            mimeType: driveFile.mimeType,
            path: driveFile.id,
            driveFileId: driveFile.id,
            syncedFromDrive: true,
            uploadedById: project.createdById,
            projectId: params.id,
            version,
            fileGroupId,
          },
        });
        changed = true;
      }
    }

    // DELETED FILES: in DB with driveFileId but not in Drive
    for (const dbFile of dbFiles) {
      if (dbFile.driveFileId && !driveFileMap.has(dbFile.driveFileId)) {
        await prisma.file.delete({ where: { id: dbFile.id } });
        changed = true;
      }
    }

    // RENAMED FILES: driveFileId matches but name differs
    for (const dbFile of dbFiles) {
      if (dbFile.driveFileId) {
        const driveFile = driveFileMap.get(dbFile.driveFileId);
        if (driveFile && driveFile.name !== dbFile.originalName) {
          await prisma.file.update({
            where: { id: dbFile.id },
            data: { originalName: driveFile.name, name: driveFile.name },
          });
          changed = true;
        }
      }
    }

    // Update lastSyncedAt
    await prisma.project.update({
      where: { id: params.id },
      data: { lastSyncedAt: new Date() },
    });

    return NextResponse.json({ synced: true, changed });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
