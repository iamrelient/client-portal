import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { driveFileId, fileName, mimeType, size } = await req.json();

    if (!driveFileId || !fileName) {
      return NextResponse.json(
        { error: "driveFileId and fileName are required" },
        { status: 400 }
      );
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
      },
    });

    await prisma.activity.create({
      data: {
        type: "FILE_UPLOADED",
        description: `Uploaded file "${fileName}"`,
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
