import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    // Skip logging for admin users
    const session = await getServerSession(authOptions);
    if (session?.user?.role === "ADMIN") {
      return NextResponse.json({ success: true });
    }

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
