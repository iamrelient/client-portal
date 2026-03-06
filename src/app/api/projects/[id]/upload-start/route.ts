import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import {
  createResumableUploadSession,
  getDriveStorageQuota,
} from "@/lib/google-drive";

export const maxDuration = 15;

/**
 * Creates a resumable upload session on Google Drive (server-side).
 * No CORS origin needed since chunks are forwarded by the server, not the browser.
 * Also checks storage quota before starting.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { driveFolderId: true, authorizedEmails: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Allow ADMIN or authorized client
    if (
      session.user.role !== "ADMIN" &&
      !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Project has no Drive folder" },
        { status: 400 }
      );
    }

    const { fileName, mimeType, fileSize } = await req.json();

    if (!fileName || !mimeType || !fileSize) {
      return NextResponse.json(
        { error: "fileName, mimeType, and fileSize are required" },
        { status: 400 }
      );
    }

    // Check storage quota before starting
    try {
      const quota = await getDriveStorageQuota();
      if (quota.remaining < fileSize) {
        const remainingMB = (quota.remaining / (1024 * 1024)).toFixed(1);
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
        return NextResponse.json(
          {
            error: `Not enough Google Drive storage. File is ${fileSizeMB} MB but only ${remainingMB} MB remaining. Please contact the administrator.`,
          },
          { status: 507 }
        );
      }
    } catch (quotaErr) {
      // Non-fatal: log but proceed (better to try and fail than block on quota check failure)
      console.warn("Storage quota check failed:", quotaErr);
    }

    // Create resumable session WITHOUT origin (server-side upload, no CORS needed)
    const uploadUri = await createResumableUploadSession(
      project.driveFolderId,
      fileName,
      mimeType
      // No origin — server will PUT chunks, not the browser
    );

    return NextResponse.json({ uploadUri });
  } catch (error) {
    console.error("Upload start error:", error);
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
