import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { uploadChunkToResumableSession } from "@/lib/google-drive";

export const maxDuration = 60;

/**
 * Receives a file chunk from the browser and forwards it to Google Drive
 * via the resumable upload protocol. Each chunk stays under Vercel's 4.5 MB
 * request body limit.
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
      select: { id: true, authorizedEmails: true },
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

    const formData = await req.formData();
    const chunk = formData.get("chunk") as File | null;
    const uploadUri = formData.get("uploadUri") as string;
    const rangeStart = Number(formData.get("rangeStart"));
    const rangeEnd = Number(formData.get("rangeEnd"));
    const totalSize = Number(formData.get("totalSize"));

    if (
      !chunk ||
      !uploadUri ||
      isNaN(rangeStart) ||
      isNaN(rangeEnd) ||
      isNaN(totalSize)
    ) {
      return NextResponse.json(
        {
          error:
            "chunk, uploadUri, rangeStart, rangeEnd, and totalSize are required",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await chunk.arrayBuffer());

    const result = await uploadChunkToResumableSession(
      uploadUri,
      buffer,
      rangeStart,
      rangeEnd,
      totalSize
    );

    if (result.complete) {
      return NextResponse.json({
        complete: true,
        driveFileId: result.fileMetadata!.id,
        fileName: result.fileMetadata!.name,
        size: result.fileMetadata!.size,
      });
    }

    return NextResponse.json({
      complete: false,
      bytesReceived: result.bytesReceived,
    });
  } catch (error) {
    console.error("Upload chunk error:", error);
    const message =
      error instanceof Error ? error.message : "Chunk upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
