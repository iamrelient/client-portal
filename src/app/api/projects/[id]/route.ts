import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { randomUUID } from "crypto";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      files: {
        select: {
          id: true,
          originalName: true,
          size: true,
          mimeType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (
    session.user.role !== "ADMIN" &&
    !project.authorizedEmails.includes((session.user.email ?? "").toLowerCase())
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response: Record<string, unknown> = {
    id: project.id,
    name: project.name,
    thumbnailPath: project.thumbnailPath,
    files: project.files,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
  };

  if (session.user.role === "ADMIN") {
    response.authorizedEmails = project.authorizedEmails;
  }

  return NextResponse.json(response);
}

export async function PATCH(
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
    const name = formData.get("name") as string | null;
    const emails = formData.get("emails") as string | null;
    const thumbnail = formData.get("thumbnail") as globalThis.File | null;

    const data: Record<string, unknown> = {};

    if (name?.trim()) {
      data.name = name.trim();
    }

    if (emails !== null) {
      data.authorizedEmails = emails
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }

    if (thumbnail && thumbnail.size > 0) {
      // Delete old thumbnail from R2
      if (project.thumbnailPath) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: project.thumbnailPath,
            })
          );
        } catch {
          // Old thumbnail may already be gone
        }
      }

      const bytes = await thumbnail.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = thumbnail.name.includes(".")
        ? `.${thumbnail.name.split(".").pop()}`
        : "";
      const key = `thumbnails/${randomUUID()}${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: thumbnail.type || "image/jpeg",
        })
      );

      data.thumbnailPath = key;
    }

    await prisma.project.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ message: "Project updated" });
  } catch (error) {
    console.error("Project update error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { files: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Delete all file objects from R2
    for (const file of project.files) {
      try {
        await r2.send(
          new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: file.path })
        );
      } catch {
        // Continue even if individual file delete fails
      }
    }

    // Delete thumbnail from R2
    if (project.thumbnailPath) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: project.thumbnailPath,
          })
        );
      } catch {
        // Thumbnail may already be gone
      }
    }

    // Cascade deletes files from DB
    await prisma.project.delete({ where: { id: params.id } });

    await prisma.activity.create({
      data: {
        type: "PROJECT_DELETED",
        description: `Deleted project "${project.name}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    console.error("Project delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
