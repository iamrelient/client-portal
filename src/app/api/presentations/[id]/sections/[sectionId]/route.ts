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
    const {
      fileId,
      title,
      description,
      chapter,
      transitionStyle,
      metadata,
      appendFileIds,
      removeFileIds,
    } = body;

    const data: Record<string, unknown> = {};

    if (fileId !== undefined) data.fileId = fileId || null;
    if (title !== undefined) data.title = title || null;
    if (description !== undefined) data.description = description || null;
    if (chapter !== undefined) data.chapter = chapter || null;
    if (transitionStyle !== undefined)
      data.transitionStyle = transitionStyle || null;
    if (metadata !== undefined) data.metadata = metadata;

    // Atomic carousel list mutations: compute the next fileIds list on the
    // server from the freshly-read section, so rapid clicks can't race.
    const appends = Array.isArray(appendFileIds)
      ? (appendFileIds as unknown[]).filter((v): v is string => typeof v === "string")
      : null;
    const removes = Array.isArray(removeFileIds)
      ? (removeFileIds as unknown[]).filter((v): v is string => typeof v === "string")
      : null;
    if (appends || removes) {
      const currentMeta = (section.metadata as Record<string, unknown> | null) || {};
      const currentIdsRaw = Array.isArray(currentMeta.fileIds)
        ? (currentMeta.fileIds as unknown[]).filter(
            (v): v is string => typeof v === "string"
          )
        : [];
      // Fold in the legacy single-file id if this is the first transition
      // into carousel mode, so the existing hero image isn't lost.
      if (currentIdsRaw.length === 0 && section.fileId) {
        currentIdsRaw.push(section.fileId);
      }
      let next = currentIdsRaw;
      if (appends) {
        const toAdd = appends.filter((id) => !next.includes(id));
        next = [...next, ...toAdd];
      }
      if (removes) {
        const removeSet = new Set(removes);
        next = next.filter((id) => !removeSet.has(id));
      }
      // Keep section.fileId in sync with the list (first id, or null).
      data.metadata = { ...currentMeta, fileIds: next };
      if (!("fileId" in body)) {
        data.fileId = next[0] ?? null;
      }
    }

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
