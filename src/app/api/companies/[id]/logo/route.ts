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
    const company = await prisma.company.findUnique({
      where: { id: params.id },
      select: { logoPath: true },
    });

    if (!company?.logoPath) {
      return NextResponse.json({ error: "No logo" }, { status: 404 });
    }

    const { stream, mimeType } = await downloadFile(company.logoPath);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": mimeType || "image/png",
        "Cache-Control": "public, max-age=3600",
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
