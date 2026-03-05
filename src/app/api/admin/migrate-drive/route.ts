import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateRootFolder,
  moveFile,
} from "@/lib/google-drive";

// One-time migration: move project folders from old My Drive root to new Shared Drive root
// This keeps all file IDs and folder IDs the same — no DB changes needed.
// After moving, files are owned by the Shared Drive and count against org storage (2TB)
// instead of the service account's personal 15GB quota.

export const maxDuration = 300; // 5 minutes for migration

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const oldRootId = body.oldRootId as string;

    if (!oldRootId) {
      return NextResponse.json(
        { error: "oldRootId is required (the previous GOOGLE_DRIVE_ROOT_FOLDER_ID)" },
        { status: 400 }
      );
    }

    const newRootId = await findOrCreateRootFolder();

    if (oldRootId === newRootId) {
      return NextResponse.json(
        { error: "Old and new root IDs are the same — nothing to migrate" },
        { status: 400 }
      );
    }

    // Get all projects that have Drive folders
    const projects = await prisma.project.findMany({
      where: { driveFolderId: { not: null } },
      select: { id: true, name: true, driveFolderId: true },
    });

    const results: { name: string; status: string; error?: string }[] = [];

    for (const project of projects) {
      if (!project.driveFolderId) continue;

      try {
        // Move the project folder from old root to new Shared Drive root
        await moveFile(project.driveFolderId, oldRootId, newRootId);
        results.push({ name: project.name, status: "moved" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ name: project.name, status: "error", error: message });
      }
    }

    const moved = results.filter((r) => r.status === "moved").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      message: `Migration complete: ${moved} moved, ${errors} errors`,
      oldRootId,
      newRootId,
      results,
    });
  } catch (error) {
    console.error("Migration error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
