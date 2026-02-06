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

  const files = await prisma.file.findMany({
    select: {
      id: true,
      name: true,
      originalName: true,
      size: true,
      mimeType: true,
      createdAt: true,
      uploadedBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as globalThis.File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
    const key = `${randomUUID()}${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );

    const dbFile = await prisma.file.create({
      data: {
        name: key,
        originalName: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        path: key,
        uploadedById: session.user.id,
      },
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Uploaded file "${file.name}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "File uploaded successfully", fileId: dbFile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
