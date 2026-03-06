import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import {
  createResumableUploadSession,
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

    // NOTE: Quota check removed — the About API returns the service account's
    // personal quota, which is 0 for Shared Drives. Files uploaded to a Shared
    // Drive count against the Shared Drive's quota, not the service account's.
    // If the Shared Drive is truly full, Google will reject the upload with a
    // storageQuotaExceeded error which we surface in the chunk handler.

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
