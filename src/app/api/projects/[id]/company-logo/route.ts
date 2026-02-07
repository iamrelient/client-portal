import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";

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

    const obj = await r2.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: project.companyLogoPath,
      })
    );

    const stream = obj.Body as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": obj.ContentType || "image/png",
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
