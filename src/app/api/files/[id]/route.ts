import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: params.id },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete from R2
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: file.path,
        })
      );
    } catch {
      // File may already be removed from storage
    }

    // Delete from database
    await prisma.file.delete({
      where: { id: params.id },
    });

    await prisma.activity.create({
      data: {
        type: "FILE_DELETED",
        description: `Deleted file "${file.originalName}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("File delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
