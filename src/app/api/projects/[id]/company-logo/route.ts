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
      select: { companyLogoPath: true },
    });

    if (!project?.companyLogoPath) {
      return NextResponse.json({ error: "No logo" }, { status: 404 });
    }

    // companyLogoPath stores the Drive file ID
    const { stream, mimeType } = await downloadFile(project.companyLogoPath);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": mimeType || "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Company logo fetch error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
