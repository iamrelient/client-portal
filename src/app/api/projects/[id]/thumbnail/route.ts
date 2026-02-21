import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { thumbnailPath: true },
    });

    if (!project?.thumbnailPath) {
      return NextResponse.json(
        { error: "No thumbnail" },
        { status: 404 }
      );
    }

    // thumbnailPath stores the Drive file ID
    const { stream, mimeType } = await downloadFile(project.thumbnailPath);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": mimeType || "image/jpeg",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Thumbnail fetch error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
