import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
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

    const { stream, mimeType } = await downloadFile(project.thumbnailPath);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": mimeType || "image/jpeg",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("OG thumbnail fetch error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
