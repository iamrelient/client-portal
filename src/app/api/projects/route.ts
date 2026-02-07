import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where =
    session.user.role === "ADMIN"
      ? {}
      : { authorizedEmails: { has: (session.user.email ?? "").toLowerCase() } };

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      thumbnailPath: true,
      authorizedEmails: session.user.role === "ADMIN",
      createdAt: true,
      _count: { select: { files: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const emails = formData.get("emails") as string | null;
    const thumbnail = formData.get("thumbnail") as globalThis.File | null;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    let thumbnailPath: string | null = null;

    if (thumbnail && thumbnail.size > 0) {
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

      thumbnailPath = key;
    }

    const authorizedEmails = emails
      ? emails
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        thumbnailPath,
        authorizedEmails,
        createdById: session.user.id,
      },
    });

    await prisma.activity.create({
      data: {
        type: "PROJECT_CREATED",
        description: `Created project "${name.trim()}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Project created", projectId: project.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Project create error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
