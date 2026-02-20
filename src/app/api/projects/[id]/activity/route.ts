import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
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
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const views = await prisma.fileView.findMany({
      where: {
        file: { projectId: params.id },
      },
      select: {
        id: true,
        viewedAt: true,
        user: { select: { name: true, email: true } },
        file: { select: { originalName: true, displayName: true } },
      },
      orderBy: { viewedAt: "desc" },
      take: 50,
    });

    return NextResponse.json(views);
  } catch (error) {
    console.error("Activity fetch error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
