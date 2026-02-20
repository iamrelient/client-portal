import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import {
  findOrCreateRootFolder,
  createFolder,
  uploadFileToFolder,
  getValidAccessToken,
} from "@/lib/google-drive";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fileSelect = {
    id: true,
    name: true,
    originalName: true,
    size: true,
    mimeType: true,
    createdAt: true,
    uploadedBy: {
      select: { name: true, email: true },
    },
    project: {
      select: { id: true, name: true },
    },
  } as const;

  if (session.user.role === "ADMIN") {
    const files = await prisma.file.findMany({
      where: { projectId: null },
      select: fileSelect,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(files);
  }

  // CLIENT: return files from authorized projects + orphan files they uploaded
  const userEmail = (session.user.email ?? "").toLowerCase();
  const allProjects = await prisma.project.findMany({
    select: { id: true, authorizedEmails: true },
  });
  const authorizedProjectIds = allProjects
    .filter((p) => isEmailAuthorized(userEmail, p.authorizedEmails))
    .map((p) => p.id);

  const files = await prisma.file.findMany({
    where: {
      OR: [
        { projectId: { in: authorizedProjectIds } },
        { projectId: null, uploadedById: session.user.id },
      ],
    },
    select: fileSelect,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(files);
}

const GENERAL_FILES_FOLDER = "_General Files";

async function getGeneralFilesFolder(): Promise<string> {
  const rootId = await findOrCreateRootFolder();
  const token = await getValidAccessToken();

  const query = `name='${GENERAL_FILES_FOLDER}' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (res.ok) {
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  return createFolder(GENERAL_FILES_FOLDER, rootId);
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

    const folderId = await getGeneralFilesFolder();

    const result = await uploadFileToFolder(
      folderId,
      file.name,
      file.type || "application/octet-stream",
      buffer
    );

    const dbFile = await prisma.file.create({
      data: {
        name: file.name,
        originalName: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        path: result.id,
        driveFileId: result.id,
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
