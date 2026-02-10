import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createResumableUploadSession } from "@/lib/google-drive";

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
      select: { driveFolderId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    const { fileName, mimeType } = await req.json();

    if (!fileName || !mimeType) {
      return NextResponse.json(
        { error: "fileName and mimeType are required" },
        { status: 400 }
      );
    }

    const uploadUri = await createResumableUploadSession(
      project.driveFolderId,
      fileName,
      mimeType
    );

    return NextResponse.json({ uploadUri });
  } catch (error) {
    console.error("Upload session error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
