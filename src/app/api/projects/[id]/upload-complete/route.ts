import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { driveFileId, fileName, mimeType, size } = await req.json();

    if (!driveFileId || !fileName) {
      return NextResponse.json(
        { error: "driveFileId and fileName are required" },
        { status: 400 }
      );
    }

    // Version detection: check for existing files with same name in this project
    const existingFiles = await prisma.file.findMany({
      where: { projectId: params.id, originalName: fileName },
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
        size: size || 0,
        mimeType: mimeType || "application/octet-stream",
        path: driveFileId,
        driveFileId,
        uploadedById: session.user.id,
        projectId: params.id,
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
