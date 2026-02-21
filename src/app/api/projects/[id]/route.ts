import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import {
  uploadFileToFolder,
  deleteFile,
  deleteFolder,
  createFolder,
  isGoogleDriveConnected,
} from "@/lib/google-drive";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      files: {
        select: {
          id: true,
          originalName: true,
          size: true,
          mimeType: true,
          category: true,
          displayName: true,
          isCurrent: true,
          version: true,
          fileGroupId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (
    session.user.role !== "ADMIN" &&
    !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response: Record<string, unknown> = {
    id: project.id,
    name: project.name,
    status: project.status,
    thumbnailPath: project.thumbnailPath,
    company: project.company,
    driveFolderId: project.driveFolderId,
    files: project.files,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
  };

  if (session.user.role === "ADMIN") {
    response.authorizedEmails = project.authorizedEmails;
  }

  return NextResponse.json(response);
}

export async function PATCH(
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
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Handle JSON requests (e.g. removeThumbnail)
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const jsonData: Record<string, unknown> = {};

      if (body.removeThumbnail) {
        const driveConn = await isGoogleDriveConnected();
        if (driveConn && project.thumbnailPath) {
          try { await deleteFile(project.thumbnailPath); } catch { /* already gone */ }
        }
        jsonData.thumbnailPath = null;
      }


      await prisma.project.update({ where: { id: params.id }, data: jsonData });
      return NextResponse.json({ message: "Project updated" });
    }

    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const emails = formData.get("emails") as string | null;
    const company = formData.get("company") as string | null;
    const status = formData.get("status") as string | null;
    const thumbnail = formData.get("thumbnail") as globalThis.File | null;

    const data: Record<string, unknown> = {};

    if (name?.trim()) {
      data.name = name.trim();
    }

    if (formData.has("company")) {
      data.company = company?.trim() || null;
    }

    const validStatuses = ["concept", "in_progress", "review", "revisions", "complete"];
    if (status && validStatuses.includes(status)) {
      data.status = status;
    }

    if (emails !== null) {
      data.authorizedEmails = emails
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }

    const driveConnected = await isGoogleDriveConnected();

    if (thumbnail && thumbnail.size > 0) {
      if (driveConnected && project.thumbnailPath) {
        try {
          await deleteFile(project.thumbnailPath);
        } catch {
          // Old thumbnail may already be gone
        }
      }

      if (driveConnected && project.driveFolderId) {
        const bytes = await thumbnail.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Find or create _assets folder
        let assetsId: string;
        try {
          assetsId = await createFolder("_assets", project.driveFolderId);
        } catch {
          assetsId = project.driveFolderId;
        }

        const result = await uploadFileToFolder(
          assetsId,
          `thumbnail_${thumbnail.name}`,
          thumbnail.type || "image/jpeg",
          buffer
        );
        data.thumbnailPath = result.id;
      }
    }

    await prisma.project.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ message: "Project updated" });
  } catch (error) {
    console.error("Project update error:", error);
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

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { files: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Delete Drive folder (includes all files inside it)
    if (project.driveFolderId) {
      try {
        await deleteFolder(project.driveFolderId);
      } catch {
        // Drive folder may already be gone
      }
    }

    await prisma.project.delete({ where: { id: params.id } });

    await prisma.activity.create({
      data: {
        type: "PROJECT_DELETED",
        description: `Deleted project "${project.name}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    console.error("Project delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
