import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import {
  findOrCreateRootFolder,
  createFolder,
  uploadFileToFolder,
  isGoogleDriveConnected,
} from "@/lib/google-drive";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allProjects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      thumbnailPath: true,
      company: true,
      companyLogoPath: true,
      authorizedEmails: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { files: true } },
      files: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (session.user.role === "ADMIN") {
    return NextResponse.json(allProjects);
  }

  // Filter by email/domain match for non-admin users
  const userEmail = (session.user.email ?? "").toLowerCase();
  const authorized = allProjects
    .filter((p) => isEmailAuthorized(userEmail, p.authorizedEmails))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ authorizedEmails, ...rest }) => rest);

  return NextResponse.json(authorized);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const emails = formData.get("emails") as string | null;
    const company = formData.get("company") as string | null;
    const thumbnail = formData.get("thumbnail") as globalThis.File | null;
    const companyLogo = formData.get("companyLogo") as globalThis.File | null;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const driveConnected = await isGoogleDriveConnected();

    let driveFolderId: string | null = null;
    let thumbnailPath: string | null = null;
    let companyLogoPath: string | null = null;

    if (driveConnected) {
      // Create project folder in Drive
      const rootId = await findOrCreateRootFolder();
      driveFolderId = await createFolder(name.trim(), rootId);

      // Create _assets subfolder for thumbnails/logos
      const assetsId = await createFolder("_assets", driveFolderId);

      if (thumbnail && thumbnail.size > 0) {
        const bytes = await thumbnail.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const result = await uploadFileToFolder(
          assetsId,
          `thumbnail_${thumbnail.name}`,
          thumbnail.type || "image/jpeg",
          buffer
        );
        thumbnailPath = result.id;
      }

      if (companyLogo && companyLogo.size > 0) {
        const bytes = await companyLogo.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const result = await uploadFileToFolder(
          assetsId,
          `logo_${companyLogo.name}`,
          companyLogo.type || "image/jpeg",
          buffer
        );
        companyLogoPath = result.id;
      }
    }

    const authorizedEmails = emails
      ? emails
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      : [];

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        thumbnailPath,
        company: company?.trim() || null,
        companyLogoPath,
        driveFolderId,
        authorizedEmails,
        createdById: session.user.id,
      },
    });

    await prisma.activity.create({
      data: {
        type: "PROJECT_CREATED",
        description: `Created project "${name.trim()}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      { message: "Project created", projectId: project.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Project create error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
