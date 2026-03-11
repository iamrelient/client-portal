import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { listFilesInFolder, uploadFileToFolder } from "@/lib/google-drive";
import { sendInspirationNotification } from "@/lib/email";
import { randomBytes } from "crypto";

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

    // Allow ADMIN or any authorized user (client)
    if (
      session.user.role !== "ADMIN" &&
      !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    // ── URL shortcut upload (server-side) ──
    if (body.url) {
      const { url, displayName, notes, boardType } = body;

      if (!project.driveFolderId) {
        return NextResponse.json(
          { error: "Project has no Drive folder" },
          { status: 400 }
        );
      }

      // Build the .url shortcut file
      let domain = displayName || url;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {}

      const fileName = `${domain}.url`;
      const content = `[InternetShortcut]\nURL=${url}\n`;
      const buffer = Buffer.from(content, "utf-8");

      // Upload to Drive server-side
      const driveResult = await uploadFileToFolder(
        project.driveFolderId,
        fileName,
        "application/internet-shortcut",
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
          size: buffer.length,
          mimeType: "application/internet-shortcut",
          path: driveResult.id,
          driveFileId: driveResult.id,
          uploadedById: session.user.id,
          projectId: params.id,
          category: "DESIGN_INSPIRATION",
          displayName: domain,
          notes: notes || null,
          boardType: boardType || null,
          version,
          fileGroupId,
        },
      });

      await prisma.activity.create({
        data: {
          type: "FILE_UPLOADED",
          description: `Added inspiration "${domain}" to project "${project.name}"`,
          userId: session.user.id,
        },
      });

      sendInspirationNotification({
        projectName: project.name,
        fileName: domain,
        uploaderName: session.user.name || session.user.email || "Unknown",
        uploaderRole: session.user.role as "ADMIN" | "USER",
        notes: notes || null,
        projectId: params.id,
      }).catch(() => {});

      return NextResponse.json(
        { message: "Inspiration added", fileId: dbFile.id },
        { status: 201 }
      );
    }

    // ── Standard file upload (client already uploaded to Drive) ──
    const { driveFileId: providedDriveFileId, fileName, mimeType, size, displayName, notes, boardType: bodyBoardType } = body;

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
      const existingDriveIds = new Set(
        (
          await prisma.file.findMany({
            where: { projectId: params.id, driveFileId: { not: null } },
            select: { driveFileId: true },
          })
        ).map((f) => f.driveFileId)
      );
      const nameMatches = driveFiles.filter((f) => f.name === fileName);
      const match =
        nameMatches.find((f) => !existingDriveIds.has(f.id)) || nameMatches[0];
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

    // Check if sync already created a record for this driveFileId (race condition)
    const existingByDriveId = driveFileId
      ? await prisma.file.findFirst({
          where: { projectId: params.id, driveFileId },
        })
      : null;

    if (existingByDriveId) {
      // Sync beat us — update the existing record to the correct category
      const dbFile = await prisma.file.update({
        where: { id: existingByDriveId.id },
        data: {
          category: "DESIGN_INSPIRATION",
          displayName: displayName || existingByDriveId.displayName,
          notes: notes || existingByDriveId.notes,
          boardType: bodyBoardType || existingByDriveId.boardType,
          uploadedById: session.user.id,
        },
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
        uploaderRole: session.user.role as "ADMIN" | "USER",
        notes: notes || null,
        projectId: params.id,
      }).catch(() => {});

      return NextResponse.json(
        { message: "Inspiration added", fileId: dbFile.id },
        { status: 201 }
      );
    }

    // Version detection by name matching
    const existingFiles = await prisma.file.findMany({
      where: {
        projectId: params.id,
        originalName: { equals: fileName, mode: "insensitive" },
      },
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
        category: "DESIGN_INSPIRATION",
        displayName: displayName || null,
        notes: notes || null,
        boardType: bodyBoardType || null,
        version,
        fileGroupId,
      },
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Added inspiration "${displayName || fileName}" to project "${project.name}"`,
        userId: session.user.id,
      },
    });

    // Send email notification (fire-and-forget)
    sendInspirationNotification({
      projectName: project.name,
      fileName: displayName || fileName,
      uploaderName: session.user.name || session.user.email || "Unknown",
      uploaderRole: session.user.role as "ADMIN" | "USER",
      notes: notes || null,
      projectId: params.id,
    }).catch(() => {});

    return NextResponse.json(
      { message: "Inspiration added", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Inspiration upload error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
