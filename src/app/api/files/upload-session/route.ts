import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createResumableUploadSession,
  findOrCreateRootFolder,
  createFolder,
  getValidAccessToken,
} from "@/lib/google-drive";

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
    const { fileName, mimeType } = await req.json();

    if (!fileName || !mimeType) {
      return NextResponse.json(
        { error: "fileName and mimeType are required" },
        { status: 400 }
      );
    }

    const folderId = await getGeneralFilesFolder();

    const uploadUri = await createResumableUploadSession(
      folderId,
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
