import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/google-drive";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: params.id },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const body = await req.json();

    // Non-admin users can only edit their own files, and only displayName + notes
    const isAdmin = session.user.role === "ADMIN";
    const isOwner = file.uploadedById === session.user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "You can only edit files you uploaded" }, { status: 403 });
    }

    const data: Record<string, unknown> = {};

    // Admin-only fields
    if (isAdmin) {
      if ("isCurrent" in body) {
        data.isCurrent = Boolean(body.isCurrent);

        // When unchecking current on a grouped file, also uncheck all versions in the group
        if (!body.isCurrent && file.fileGroupId) {
          await prisma.file.updateMany({
            where: { fileGroupId: file.fileGroupId },
            data: { isCurrent: false },
          });
        }
      }

      if ("category" in body && ["RENDER", "DRAWING", "CAD_DRAWING", "SUPPORTING", "DESIGN_INSPIRATION", "OTHER"].includes(body.category)) {
        data.category = body.category;
      }

      if ("fileGroupId" in body) {
        data.fileGroupId = body.fileGroupId ?? null; // null to detach
      }

      if ("version" in body) {
        data.version = Number(body.version) || 1;
      }
    }

    // Fields editable by both admin and owner
    if ("displayName" in body) {
      data.displayName = body.displayName || null;
    }

    if ("notes" in body) {
      data.notes = body.notes || null;
    }

    await prisma.file.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ message: "File updated" });
  } catch (error) {
    console.error("File update error:", error);
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

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: params.id },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Permission check: ADMIN can delete anything, users can only delete their own uploads
    if (session.user.role !== "ADMIN" && file.uploadedById !== session.user.id) {
      return NextResponse.json({ error: "You can only delete files you uploaded" }, { status: 403 });
    }

    // Delete from Google Drive
    try {
      await deleteFile(file.path);
    } catch (err) {
      console.error("Drive delete failed (will still remove from DB):", err);
    }

    // Track deleted driveFileId on the project so sync won't re-create it
    if (file.driveFileId && file.projectId) {
      try {
        await prisma.project.update({
          where: { id: file.projectId },
          data: {
            deletedDriveIds: {
              push: file.driveFileId,
            },
          },
        });
      } catch {
        // Non-critical — worst case sync might re-create, but Drive delete usually succeeds
      }
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
