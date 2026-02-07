import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
import { randomUUID } from "crypto";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      files: {
        select: {
          id: true,
          originalName: true,
          size: true,
          mimeType: true,
          version: true,
          fileGroupId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (
    session.user.role !== "ADMIN" &&
    !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response: Record<string, unknown> = {
    id: project.id,
    name: project.name,
    thumbnailPath: project.thumbnailPath,
    company: project.company,
    companyLogoPath: project.companyLogoPath,
    files: project.files,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
  };

  if (session.user.role === "ADMIN") {
    response.authorizedEmails = project.authorizedEmails;
  }

  return NextResponse.json(response);
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
    const project = await prisma.project.findUnique({
      where: { id: params.id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const emails = formData.get("emails") as string | null;
    const company = formData.get("company") as string | null;
    const thumbnail = formData.get("thumbnail") as globalThis.File | null;
    const companyLogo = formData.get("companyLogo") as globalThis.File | null;

    const data: Record<string, unknown> = {};

    if (name?.trim()) {
      data.name = name.trim();
    }

    if (formData.has("company")) {
      data.company = company?.trim() || null;
    }

    if (emails !== null) {
      data.authorizedEmails = emails
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }

    if (thumbnail && thumbnail.size > 0) {
      if (project.thumbnailPath) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: project.thumbnailPath,
            })
          );
        } catch {
          // Old thumbnail may already be gone
        }
      }

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

      data.thumbnailPath = key;
    }

    if (companyLogo && companyLogo.size > 0) {
      if (project.companyLogoPath) {
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: project.companyLogoPath,
            })
          );
        } catch {
          // Old logo may already be gone
        }
      }

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

      data.companyLogoPath = key;
    }

    await prisma.project.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ message: "Project updated" });
  } catch (error) {
    console.error("Project update error:", error);
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
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { files: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    for (const file of project.files) {
      try {
        await r2.send(
          new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: file.path })
        );
      } catch {
        // Continue
      }
    }

    if (project.thumbnailPath) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: project.thumbnailPath,
          })
        );
      } catch {
        // Already gone
      }
    }

    if (project.companyLogoPath) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: project.companyLogoPath,
          })
        );
      } catch {
        // Already gone
      }
    }

    await prisma.project.delete({ where: { id: params.id } });

    await prisma.activity.create({
      data: {
        type: "PROJECT_DELETED",
        description: `Deleted project "${project.name}"`,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ message: "Project deleted" });
  } catch (error) {
    console.error("Project delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
