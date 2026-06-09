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
        project: {
          select: {
            id: true,
            name: true,
            company: true,
            // Needed to decide whether a pano's tile pyramid matches the
            // current watermark intent (see enrichedSections below).
            watermarkEnabled: true,
          },
        },
        sections: {
          orderBy: { order: "asc" },
          include: {
            file: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                size: true,
                // Multires pyramid params — the viewer needs these to
                // build the tile-streaming config. The manifest itself
                // is fetched only to derive a has-pyramid boolean and
                // is stripped before the response (it's ~130 entries
                // of Drive ids the client has no use for).
                multiresManifest: true,
                multiresMaxLevel: true,
                multiresCubeRes: true,
                multiresTileRes: true,
                multiresHasWatermark: true,
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
            logoSize: presentation.logoSize,
          },
          { status: 401 }
        );
      }
    }

    // Strip password hash from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...data } = presentation;

    // Image sections can carry a carousel — a list of fileIds in
    // metadata.fileIds. Resolve those files here so the viewer doesn't
    // need to make a second request.
    const carouselIds = new Set<string>();
    for (const s of presentation.sections) {
      const meta = s.metadata as Record<string, unknown> | null;
      const ids = meta && Array.isArray(meta.fileIds)
        ? (meta.fileIds as unknown[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [];
      for (const id of ids) carouselIds.add(id);
    }
    const carouselFileMap = new Map<
      string,
      { id: string; originalName: string; mimeType: string; size: number }
    >();
    if (carouselIds.size > 0) {
      const carouselFiles = await prisma.file.findMany({
        where: {
          id: { in: Array.from(carouselIds) },
          // Only files belonging to the same project may be rendered.
          projectId: presentation.projectId,
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
        },
      });
      for (const f of carouselFiles) carouselFileMap.set(f.id, f);
    }

    // Watermark intent for panoramas in THIS presentation. A pyramid
    // baked with a different intent (e.g. watermarking was toggled
    // after generation) must not be served — the viewer falls back to
    // the equirect asset path, which handles intent per request.
    const wantsPanoWatermark =
      presentation.project.watermarkEnabled &&
      presentation.watermarkEnabled &&
      presentation.panoramaFloorWatermark;

    const enrichedSections = presentation.sections.map((s) => {
      const meta = s.metadata as Record<string, unknown> | null;
      const ids = meta && Array.isArray(meta.fileIds)
        ? (meta.fileIds as unknown[]).filter(
            (x): x is string => typeof x === "string"
          )
        : [];
      const carouselFiles = ids
        .map((id) => carouselFileMap.get(id))
        .filter((f): f is NonNullable<typeof f> => !!f);

      // Collapse the raw multires columns into either a ready-to-use
      // param object or null, and strip the manifest from the payload.
      let file: Record<string, unknown> | null = null;
      if (s.file) {
        const {
          multiresManifest,
          multiresMaxLevel,
          multiresCubeRes,
          multiresTileRes,
          multiresHasWatermark,
          ...rest
        } = s.file;
        const hasPyramid =
          !!multiresManifest &&
          !!multiresMaxLevel &&
          !!multiresCubeRes &&
          !!multiresTileRes &&
          multiresHasWatermark === wantsPanoWatermark;
        file = {
          ...rest,
          multires: hasPyramid
            ? {
                maxLevel: multiresMaxLevel,
                cubeRes: multiresCubeRes,
                tileRes: multiresTileRes,
              }
            : null,
        };
      }

      return { ...s, file, carouselFiles };
    });

    return NextResponse.json({ ...data, sections: enrichedSections });
  } catch (error) {
    console.error("Get presentation (public) error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
