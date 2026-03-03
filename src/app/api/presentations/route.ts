import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const presentations = await prisma.presentation.findMany({
      include: {
        project: { select: { name: true } },
        _count: { select: { sections: true, accessLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(presentations);
  } catch (error) {
    console.error("List presentations error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { projectId, title, subtitle, clientLogo, clientAccentColor, password, expiresAt, watermarkEnabled } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const accessToken = crypto.randomBytes(32).toString("hex");

    let hashedPassword: string | null = null;
    if (password) {
      const { hash } = await import("bcryptjs");
      hashedPassword = await hash(password, 12);
    }

    const presentation = await prisma.presentation.create({
      data: {
        projectId,
        title: title || project.name,
        subtitle: subtitle || null,
        clientLogo: clientLogo || null,
        clientAccentColor: clientAccentColor || null,
        password: hashedPassword,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        watermarkEnabled: watermarkEnabled !== false,
        accessToken,
        createdById: session.user.id,
        sections: {
          create: [
            { type: "hero", order: 0 },
            { type: "closing", order: 1 },
          ],
        },
      },
      include: {
        sections: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(presentation, { status: 201 });
  } catch (error) {
    console.error("Create presentation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
