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
    const presentation = await prisma.presentation.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, name: true } },
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
        _count: { select: { accessLogs: true } },
      },
    });

    if (!presentation) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(presentation);
  } catch (error) {
    console.error("Get presentation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const existing = await prisma.presentation.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      title,
      subtitle,
      clientLogo,
      logoDisplay,
      clientAccentColor,
      password,
      removePassword,
      expiresAt,
      isActive,
      watermarkEnabled,
    } = body;

    const data: Record<string, unknown> = {};

    if (title !== undefined) data.title = title || null;
    if (subtitle !== undefined) data.subtitle = subtitle || null;
    if (clientLogo !== undefined) data.clientLogo = clientLogo || null;
    if (logoDisplay !== undefined) data.logoDisplay = logoDisplay || null;
    if (clientAccentColor !== undefined)
      data.clientAccentColor = clientAccentColor || null;
    if (expiresAt !== undefined)
      data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive !== undefined) data.isActive = isActive;
    if (watermarkEnabled !== undefined) data.watermarkEnabled = watermarkEnabled;

    if (removePassword) {
      data.password = null;
    } else if (password) {
      const { hash } = await import("bcryptjs");
      data.password = await hash(password, 12);
    }

    const updated = await prisma.presentation.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update presentation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const existing = await prisma.presentation.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    await prisma.presentation.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Presentation deleted" });
  } catch (error) {
    console.error("Delete presentation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
