import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder } from "@/lib/google-drive";
import { FileCategory } from "@prisma/client";

const VALID_CATEGORIES: FileCategory[] = [
  "RENDER",
  "DRAWING",
  "CAD_DRAWING",
  "SUPPORTING",
  "DESIGN_INSPIRATION",
  "OTHER",
];

/**
 * POST — create a new folder inside a category (or custom category) of a project.
 * Admin only. Creates a matching Drive subfolder under the project's Drive folder.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const category = body?.category as FileCategory | undefined;
    const customCategory =
      typeof body?.customCategory === "string" && body.customCategory.trim()
        ? body.customCategory.trim()
        : null;

    if (!name) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, driveFolderId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check for an existing folder with the same name in the same category/customCategory.
    // findFirst handles the nullable customCategory cleanly.
    const existing = await prisma.projectFolder.findFirst({
      where: {
        projectId: project.id,
        category,
        customCategory,
        name,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A folder with that name already exists in this category" },
        { status: 409 }
      );
    }

    // Create a Drive subfolder under the project folder so files can live there.
    // If the project doesn't have a driveFolderId we still create the DB record
    // — uploads will fall back to the legacy flow until the project is synced.
    let driveFolderId: string | null = null;
    if (project.driveFolderId) {
      try {
        driveFolderId = await createFolder(name, project.driveFolderId);
      } catch (err) {
        console.error("Failed to create Drive subfolder, continuing DB-only:", err);
      }
    }

    const folder = await prisma.projectFolder.create({
      data: {
        projectId: project.id,
        category,
        customCategory,
        name,
        driveFolderId,
      },
    });

    // Bump project activity timestamp so it surfaces on the dashboard.
    await prisma.project.update({
      where: { id: project.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
