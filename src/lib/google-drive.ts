import crypto from "crypto";

// ---------- Service Account Auth ----------

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  }
  return JSON.parse(raw);
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createSignedJWT(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];

  const signingInput = segments.join(".");
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), key.private_key);
  segments.push(base64url(signature));

  return segments.join(".");
}

export async function getValidAccessToken(): Promise<string> {
  // Return cached token if still valid (refresh at 55 min)
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const key = getServiceAccountKey();
  const jwt = createSignedJWT(key);

  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get service account token: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export function isGoogleDriveConnected(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

// ---------- Folder operations ----------

export async function findOrCreateRootFolder(): Promise<string> {
  const folderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");
  }
  return folderId;
}

export async function createFolder(
  name: string,
  parentId?: string
): Promise<string> {
  const accessToken = await getValidAccessToken();

  // Check if folder already exists
  const parentClause = parentId ? `and '${parentId}' in parents` : `and 'root' in parents`;
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' ${parentClause} and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create new folder
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
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
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size&supportsAllDrives=true",
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
    if (err.includes("storageQuotaExceeded")) {
      throw new Error("Google Drive storage quota exceeded. The service account has run out of space. Please use a Shared Drive folder so storage counts against your organization's quota.");
    }
    throw new Error(`Failed to upload file: ${err}`);
  }

  return res.json();
}

export async function createResumableUploadSession(
  folderId: string,
  fileName: string,
  mimeType: string,
  origin?: string
): Promise<string> {
  const accessToken = await getValidAccessToken();

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  // Include origin param so Google returns CORS headers for browser-based PUT
  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("fields", "id,name,size");
  url.searchParams.set("supportsAllDrives", "true");
  if (origin) {
    url.searchParams.set("origin", origin);
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
    },
    body: JSON.stringify(metadata),
  });

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
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`,
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
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`,
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
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
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
