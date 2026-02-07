import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allProjects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      thumbnailPath: true,
      company: true,
      companyLogoPath: true,
      authorizedEmails: true,
      createdAt: true,
      _count: { select: { files: true } },
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

    let thumbnailPath: string | null = null;
    let companyLogoPath: string | null = null;

    if (thumbnail && thumbnail.size > 0) {
      const bytes = await thumbnail.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = thumbnail.name.includes(".")
        ? `.${thumbnail.name.split(".").pop()}`
        : "";
      const key = `thumbnails/${randomUUID()}${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: thumbnail.type || "image/jpeg",
        })
      );

      thumbnailPath = key;
    }

    if (companyLogo && companyLogo.size > 0) {
      const bytes = await companyLogo.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = companyLogo.name.includes(".")
        ? `.${companyLogo.name.split(".").pop()}`
        : "";
      const key = `company-logos/${randomUUID()}${ext}`;

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: companyLogo.type || "image/jpeg",
        })
      );

      companyLogoPath = key;
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
