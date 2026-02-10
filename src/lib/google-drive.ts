import { prisma } from "./prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const ROOT_FOLDER_NAME = "Ray Renders Portal";

// ---------- Token management ----------

export async function getValidAccessToken(): Promise<string> {
  const token = await prisma.googleToken.findUnique({
    where: { id: "singleton" },
  });

  if (!token) {
    throw new Error("Google Drive not connected");
  }

  // Refresh if expiring within 5 minutes
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshAccessToken(token.refreshToken);
  }

  return token.accessToken;
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh token: ${err}`);
  }

  const data = await res.json();

  await prisma.googleToken.update({
    where: { id: "singleton" },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

export async function isGoogleDriveConnected(): Promise<boolean> {
  const token = await prisma.googleToken.findUnique({
    where: { id: "singleton" },
  });
  return !!token;
}

// ---------- Folder operations ----------

export async function createFolder(
  name: string,
  parentId?: string
): Promise<string> {
  const accessToken = await getValidAccessToken();

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create folder: ${err}`);
  }

  const data = await res.json();
  return data.id;
}

export async function findOrCreateRootFolder(): Promise<string> {
  const accessToken = await getValidAccessToken();

  // Search for existing root folder
  const query = `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to search for root folder");
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create it
  return createFolder(ROOT_FOLDER_NAME);
}

// ---------- File operations ----------

export async function uploadFileToFolder(
  folderId: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ id: string; name: string; size: number }> {
  const accessToken = await getValidAccessToken();

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  // Use multipart upload for files small enough to go through the server
  const boundary = "-------drive_upload_boundary";
  const metaJson = JSON.stringify(metadata);

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];

  const prefix = Buffer.from(bodyParts[0], "utf-8");
  const mediaHeader = Buffer.from(bodyParts[1], "utf-8");
  const suffix = Buffer.from(`\r\n--${boundary}--`, "utf-8");
  const body = Buffer.concat([prefix, mediaHeader, buffer, suffix]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload file: ${err}`);
  }

  return res.json();
}

export async function createResumableUploadSession(
  folderId: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const accessToken = await getValidAccessToken();

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create upload session: ${err}`);
  }

  const uploadUri = res.headers.get("Location");
  if (!uploadUri) {
    throw new Error("No upload URI returned from Google");
  }

  return uploadUri;
}

export async function downloadFile(
  driveFileId: string
): Promise<{ stream: ReadableStream; mimeType: string; size: number }> {
  const accessToken = await getValidAccessToken();

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`);
  }

  return {
    stream: res.body!,
    mimeType: res.headers.get("Content-Type") || "application/octet-stream",
    size: Number(res.headers.get("Content-Length") || 0),
  };
}

export async function deleteFile(driveFileId: string): Promise<void> {
  const accessToken = await getValidAccessToken();

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 204 = success, 404 = already gone — both are fine
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete file: ${res.status}`);
  }
}

export async function deleteFolder(driveFolderId: string): Promise<void> {
  // Deleting a folder in Drive also deletes its contents
  return deleteFile(driveFolderId);
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  createdTime: string;
}

export async function listFilesInFolder(
  folderId: string
): Promise<DriveFile[]> {
  const accessToken = await getValidAccessToken();
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime)",
      pageSize: "1000",
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to list files: ${res.status}`);
    }

    const data = await res.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}
