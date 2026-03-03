import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
    });

    if (!presentation || !presentation.isActive) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { viewerEmail, viewerName } = body as {
      viewerEmail?: string;
      viewerName?: string;
    };

    const forwarded = req.headers.get("x-forwarded-for");
    const ipAddress = forwarded?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    await prisma.presentationAccessLog.create({
      data: {
        presentationId: presentation.id,
        viewerEmail: viewerEmail || null,
        viewerName: viewerName || null,
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Log access error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
