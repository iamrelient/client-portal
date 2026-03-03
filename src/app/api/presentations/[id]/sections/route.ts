import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const presentation = await prisma.presentation.findUnique({
      where: { id: params.id },
      include: { sections: { orderBy: { order: "desc" }, take: 1 } },
    });

    if (!presentation) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { type, fileId, title, description, transitionStyle, metadata } = body;

    if (!type) {
      return NextResponse.json(
        { error: "Section type is required" },
        { status: 400 }
      );
    }

    // Insert before the closing section (last section)
    // Find the closing section's order, insert just before it
    const closingSection = await prisma.presentationSection.findFirst({
      where: { presentationId: params.id, type: "closing" },
    });

    let newOrder: number;
    if (closingSection) {
      // Bump closing section order up by 1
      await prisma.presentationSection.update({
        where: { id: closingSection.id },
        data: { order: closingSection.order + 1 },
      });
      newOrder = closingSection.order;
    } else {
      // No closing section — append at the end
      const maxOrder = presentation.sections[0]?.order ?? -1;
      newOrder = maxOrder + 1;
    }

    const section = await prisma.presentationSection.create({
      data: {
        presentationId: params.id,
        type,
        order: newOrder,
        fileId: fileId || null,
        title: title || null,
        description: description || null,
        transitionStyle: transitionStyle || null,
        metadata: metadata || null,
      },
      include: {
        file: {
          select: { id: true, originalName: true, mimeType: true, size: true },
        },
      },
    });

    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    console.error("Add section error:", error);
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
    const presentation = await prisma.presentation.findUnique({
      where: { id: params.id },
    });

    if (!presentation) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { sections } = body as {
      sections: { id: string; order: number }[];
    };

    if (!Array.isArray(sections)) {
      return NextResponse.json(
        { error: "sections array is required" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      sections.map((s) =>
        prisma.presentationSection.update({
          where: { id: s.id },
          data: { order: s.order },
        })
      )
    );

    return NextResponse.json({ message: "Sections reordered" });
  } catch (error) {
    console.error("Reorder sections error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
