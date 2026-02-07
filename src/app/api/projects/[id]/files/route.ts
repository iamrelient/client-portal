import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { randomUUID, randomBytes } from "crypto";

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

    const formData = await req.formData();
    const file = formData.get("file") as globalThis.File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.includes(".")
      ? `.${file.name.split(".").pop()}`
      : "";
    const key = `${randomUUID()}${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    // Version detection: check for existing files with same name in this project
    const existingFiles = await prisma.file.findMany({
      where: { projectId: params.id, originalName: file.name },
      orderBy: { version: "desc" },
    });

    let version = 1;
    let fileGroupId: string | null = null;

    if (existingFiles.length > 0) {
      version = existingFiles[0].version + 1;

      if (existingFiles[0].fileGroupId) {
        // Reuse existing group
        fileGroupId = existingFiles[0].fileGroupId;
      } else {
        // First duplicate — create a group and backfill the original file
        fileGroupId = randomBytes(12).toString("hex");
        await prisma.file.update({
          where: { id: existingFiles[0].id },
          data: { fileGroupId },
        });
      }
    }

    const dbFile = await prisma.file.create({
      data: {
        name: key,
        originalName: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        path: key,
        uploadedById: session.user.id,
        projectId: params.id,
        version,
        fileGroupId,
      },
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
