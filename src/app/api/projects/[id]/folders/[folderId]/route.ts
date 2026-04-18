import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFolder, getValidAccessToken } from "@/lib/google-drive";

/**
 * PATCH — rename a folder. Also renames the matching Drive subfolder.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; folderId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }

    const folder = await prisma.projectFolder.findUnique({
      where: { id: params.folderId },
    });

    if (!folder || folder.projectId !== params.id) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (name === folder.name) {
      return NextResponse.json(folder);
    }

    // Enforce uniqueness within (project, category, customCategory).
    // findFirst with an explicit where handles the nullable customCategory
    // better than the compound-unique selector.
    const conflict = await prisma.projectFolder.findFirst({
      where: {
        projectId: folder.projectId,
        category: folder.category,
        customCategory: folder.customCategory,
        name,
        id: { not: folder.id },
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: "A folder with that name already exists in this category" },
        { status: 409 }
      );
    }

    // Rename the Drive subfolder so Drive and portal stay in sync.
    if (folder.driveFolderId) {
      try {
        const token = await getValidAccessToken();
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${folder.driveFolderId}?supportsAllDrives=true`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name }),
          }
        );
        if (!res.ok) {
          console.error("Failed to rename Drive folder:", await res.text());
        }
      } catch (err) {
        console.error("Drive rename error:", err);
      }
    }

    const updated = await prisma.projectFolder.update({
      where: { id: folder.id },
      data: { name },
    });

    // Bump project activity timestamp for the dashboard sort.
    await prisma.project.update({
      where: { id: folder.projectId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Rename folder error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — remove a folder. Only allowed when empty. Also removes the
 * matching Drive subfolder.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; folderId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const folder = await prisma.projectFolder.findUnique({
      where: { id: params.folderId },
      include: { _count: { select: { files: true } } },
    });

    if (!folder || folder.projectId !== params.id) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder._count.files > 0) {
      return NextResponse.json(
        {
          error:
            "Move the files out of this folder before deleting it.",
        },
        { status: 400 }
      );
    }

    if (folder.driveFolderId) {
      try {
        await deleteFolder(folder.driveFolderId);
      } catch (err) {
        console.error("Failed to delete Drive folder (continuing):", err);
      }
    }

    await prisma.projectFolder.delete({ where: { id: folder.id } });

    // Bump project activity timestamp for the dashboard sort.
    await prisma.project.update({
      where: { id: folder.projectId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message: "Folder deleted" });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
