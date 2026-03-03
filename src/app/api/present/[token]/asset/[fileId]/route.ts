import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/google-drive";

export async function GET(
  _req: Request,
  { params }: { params: { token: string; fileId: string } }
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

    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json(
        { error: "This presentation has expired" },
        { status: 403 }
      );
    }

    // Verify password cookie if password-protected
    if (presentation.password) {
      const cookieStore = cookies();
      const authCookie = cookieStore.get(`pres_${presentation.id}`);

      if (!authCookie || authCookie.value !== presentation.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Verify this file belongs to a section of this presentation or is the client logo
    const isClientLogo = presentation.clientLogo === params.fileId;

    if (!isClientLogo) {
      const section = await prisma.presentationSection.findFirst({
        where: {
          presentationId: presentation.id,
          fileId: params.fileId,
        },
      });

      if (!section) {
        return NextResponse.json(
          { error: "File not found in presentation" },
          { status: 404 }
        );
      }
    }

    const file = await prisma.file.findUnique({
      where: { id: params.fileId },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const { stream } = await downloadFile(file.path);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.originalName}"`,
        "Cache-Control": "private, max-age=3600, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Serve presentation asset error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
