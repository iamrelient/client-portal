import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
      include: {
        project: { select: { id: true, name: true, company: true } },
        sections: {
          orderBy: { order: "asc" },
          include: {
            file: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
              },
            },
          },
        },
      },
    });

    if (!presentation) {
      return NextResponse.json(
        { error: "not_found", message: "Presentation not found" },
        { status: 404 }
      );
    }

    if (!presentation.isActive) {
      return NextResponse.json(
        { error: "revoked", message: "This presentation is no longer available" },
        { status: 403 }
      );
    }

    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json(
        { error: "expired", message: "This presentation has expired" },
        { status: 403 }
      );
    }

    // Check password protection
    if (presentation.password) {
      const cookieStore = cookies();
      const authCookie = cookieStore.get(`pres_${presentation.id}`);

      if (!authCookie || authCookie.value !== presentation.id) {
        return NextResponse.json(
          {
            error: "password_required",
            title: presentation.title,
            clientLogo: presentation.clientLogo,
            logoDisplay: presentation.logoDisplay,
          },
          { status: 401 }
        );
      }
    }

    // Strip password hash from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...data } = presentation;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get presentation (public) error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
