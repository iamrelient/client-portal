import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = await prisma.file.findUnique({
    where: { id: params.id },
    select: { fileGroupId: true, projectId: true },
  });

  if (!file || !file.fileGroupId) {
    return NextResponse.json({ error: "No version history" }, { status: 404 });
  }

  // Check authorization: admin or authorized for the project
  if (session.user.role !== "ADMIN" && file.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: file.projectId },
      select: { authorizedEmails: true },
    });

    if (
      !project ||
      !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const versions = await prisma.file.findMany({
    where: { fileGroupId: file.fileGroupId },
    select: {
      id: true,
      originalName: true,
      displayName: true,
      category: true,
      isCurrent: true,
      size: true,
      mimeType: true,
      version: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });

  return NextResponse.json(versions);
}
