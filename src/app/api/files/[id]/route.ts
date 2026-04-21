import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFile, moveFile } from "@/lib/google-drive";

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

      if ("isOutdated" in body) {
        const next = Boolean(body.isOutdated);
        data.isOutdated = next;
        // Outdated files can't also be featured — clear isCurrent when
        // marking outdated to keep state consistent.
        if (next) data.isCurrent = false;
      }

      if ("category" in body && ["RENDER", "DRAWING", "CAD_DRAWING", "SUPPORTING", "DESIGN_INSPIRATION", "OTHER"].includes(body.category)) {
        data.category = body.category;
      }

      if ("customCategory" in body) {
        data.customCategory = body.customCategory || null;
      }

      if ("fileGroupId" in body) {
        data.fileGroupId = body.fileGroupId ?? null; // null to detach
      }

      if ("version" in body) {
        data.version = Number(body.version) || 1;
      }

      // Folder move — update DB + mirror to Drive.
      if ("folderId" in body) {
        const nextFolderId: string | null = body.folderId || null;
        if (nextFolderId !== file.folderId) {
          // Resolve Drive parent IDs for the move. The "old parent" is the
          // current folder's Drive ID or the project's Drive folder; same
          // logic for the "new parent".
          const [oldFolder, newFolder, project] = await Promise.all([
            file.folderId
              ? prisma.projectFolder.findUnique({
                  where: { id: file.folderId },
                  select: { driveFolderId: true, projectId: true },
                })
              : Promise.resolve(null),
            nextFolderId
              ? prisma.projectFolder.findUnique({
                  where: { id: nextFolderId },
                  select: {
                    driveFolderId: true,
                    projectId: true,
                    category: true,
                    customCategory: true,
                  },
                })
              : Promise.resolve(null),
            file.projectId
              ? prisma.project.findUnique({
                  where: { id: file.projectId },
                  select: { driveFolderId: true },
                })
              : Promise.resolve(null),
          ]);

          // Reject cross-project moves
          if (newFolder && file.projectId && newFolder.projectId !== file.projectId) {
            return NextResponse.json(
              { error: "Cannot move a file to a folder in a different project" },
              { status: 400 }
            );
          }

          const projectDriveId = project?.driveFolderId ?? null;
          const oldParent = oldFolder?.driveFolderId ?? projectDriveId;
          const newParent = newFolder?.driveFolderId ?? projectDriveId;

          // Drive ID is stored on either driveFileId or legacy-style path
          const driveId = file.driveFileId || file.path;
          if (driveId && oldParent && newParent && oldParent !== newParent) {
            try {
              await moveFile(driveId, oldParent, newParent);
            } catch (err) {
              console.error("Drive move failed, DB only:", err);
            }
          }

          data.folderId = nextFolderId;

          // Keep the file's category in sync with the folder it's moving into.
          // Folders are scoped to (category, customCategory) so a file living
          // in a folder must share that category. Caller-supplied category
          // still wins if they explicitly set one in the same PATCH.
          if (newFolder && !("category" in body) && !("customCategory" in body)) {
            data.category = newFolder.category;
            data.customCategory = newFolder.customCategory;
          }
        }
      }

      // If the file's category or customCategory changed and it no longer
      // matches the folder it lives in, detach the folder automatically.
      const nextCategory =
        "category" in body ? (data.category as string | undefined) : undefined;
      const nextCustomCategory =
        "customCategory" in body
          ? (data.customCategory as string | null | undefined)
          : undefined;
      const categoryChanged = nextCategory !== undefined && nextCategory !== file.category;
      const customChanged =
        nextCustomCategory !== undefined && nextCustomCategory !== file.customCategory;
      if ((categoryChanged || customChanged) && !("folderId" in body) && file.folderId) {
        const currentFolder = await prisma.projectFolder.findUnique({
          where: { id: file.folderId },
          select: { category: true, customCategory: true },
        });
        if (currentFolder) {
          const effectiveCategory =
            nextCategory !== undefined ? nextCategory : file.category;
          const effectiveCustom =
            nextCustomCategory !== undefined ? nextCustomCategory : file.customCategory;
          if (
            currentFolder.category !== effectiveCategory ||
            (currentFolder.customCategory ?? null) !== (effectiveCustom ?? null)
          ) {
            data.folderId = null;
          }
        }
      }
    }

    // Fields editable by both admin and owner
    if ("displayName" in body) {
      data.displayName = body.displayName || null;
    }

    if ("notes" in body) {
      data.notes = body.notes || null;
    }

    if ("boardType" in body) {
      const validBoardTypes = ["INTERIOR", "EXTERIOR"];
      if (body.boardType === null || validBoardTypes.includes(body.boardType)) {
        data.boardType = body.boardType;
      }
    }

    await prisma.file.update({
      where: { id: params.id },
      data,
    });

    // Bump project.lastActivityAt so the dashboard can surface recent
    // activity. We use a dedicated column instead of updatedAt because
    // sync touches updatedAt on every project view.
    if (file.projectId) {
      await prisma.project.update({
        where: { id: file.projectId },
        data: { lastActivityAt: new Date() },
      });
    }

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

    // Resolve the Drive file ID (prefer explicit driveFileId, fall back to path)
    const driveId = file.driveFileId || file.path;

    // ALWAYS track driveFileId on the project BEFORE deleting from Drive.
    // This prevents a race where sync re-imports the file between Drive delete
    // and DB delete. The sync cleanup will remove the ID once it confirms
    // the file is gone from Drive.
    if (driveId && file.projectId) {
      // Collect both IDs in case they differ
      const idsToTrack = new Set([driveId]);
      if (file.driveFileId && file.driveFileId !== driveId) idsToTrack.add(file.driveFileId);
      if (file.path && file.path !== driveId) idsToTrack.add(file.path);

      try {
        await prisma.project.update({
          where: { id: file.projectId },
          data: {
            deletedDriveIds: {
              push: Array.from(idsToTrack),
            },
          },
        });
      } catch (pushErr) {
        console.error("Failed to track deleted driveFileId:", pushErr);
      }
    }

    // Delete from Google Drive — try with retry for transient failures
    let driveDeleteFailed = false;
    if (driveId) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await deleteFile(driveId);
          driveDeleteFailed = false;
          break;
        } catch (err) {
          console.error(`Drive delete attempt ${attempt} failed for ${driveId}:`, err);
          driveDeleteFailed = true;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      // If primary ID failed and path differs, try path as fallback
      if (driveDeleteFailed && file.path && file.path !== driveId) {
        try {
          await deleteFile(file.path);
          driveDeleteFailed = false;
        } catch (err) {
          console.error(`Drive delete fallback failed for ${file.path}:`, err);
        }
      }
    }

    // Delete this record AND any duplicates with the same driveFileId
    // (sync can create duplicate records pointing to the same Drive file)
    if (file.driveFileId && file.projectId) {
      await prisma.file.deleteMany({
        where: {
          projectId: file.projectId,
          driveFileId: file.driveFileId,
        },
      });
    } else {
      await prisma.file.delete({
        where: { id: params.id },
      });
    }

    await prisma.activity.create({
      data: {
        type: "FILE_DELETED",
        description: `Deleted file "${file.originalName}"`,
        userId: session.user.id,
      },
    });

    // Bump project.lastActivityAt so this surfaces on the dashboard.
    if (file.projectId) {
      await prisma.project.update({
        where: { id: file.projectId },
        data: { lastActivityAt: new Date() },
      });
    }

    return NextResponse.json({
      message: "File deleted successfully",
      driveDeleted: !driveDeleteFailed,
    });
  } catch (error) {
    console.error("File delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
