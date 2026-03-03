import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const section = await prisma.presentationSection.findFirst({
      where: { id: params.sectionId, presentationId: params.id },
    });

    if (!section) {
      return NextResponse.json(
        { error: "Section not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { fileId, title, description, transitionStyle, metadata } = body;

    const data: Record<string, unknown> = {};

    if (fileId !== undefined) data.fileId = fileId || null;
    if (title !== undefined) data.title = title || null;
    if (description !== undefined) data.description = description || null;
    if (transitionStyle !== undefined)
      data.transitionStyle = transitionStyle || null;
    if (metadata !== undefined) data.metadata = metadata;

    const updated = await prisma.presentationSection.update({
      where: { id: params.sectionId },
      data,
      include: {
        file: {
          select: { id: true, originalName: true, mimeType: true, size: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update section error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; sectionId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const section = await prisma.presentationSection.findFirst({
      where: { id: params.sectionId, presentationId: params.id },
    });

    if (!section) {
      return NextResponse.json(
        { error: "Section not found" },
        { status: 404 }
      );
    }

    if (section.type === "hero" || section.type === "closing") {
      return NextResponse.json(
        { error: "Cannot delete hero or closing sections" },
        { status: 400 }
      );
    }

    await prisma.presentationSection.delete({
      where: { id: params.sectionId },
    });

    return NextResponse.json({ message: "Section deleted" });
  } catch (error) {
    console.error("Delete section error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
