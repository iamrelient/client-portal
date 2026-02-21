import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateRootFolder,
  createFolder,
  uploadFileToFolder,
  deleteFile,
  isGoogleDriveConnected,
} from "@/lib/google-drive";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: params.id },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const domain = formData.get("domain") as string | null;
    const logo = formData.get("logo") as globalThis.File | null;
    const removeLogo = formData.get("removeLogo") === "true";

    const data: { name?: string; domain?: string; logoPath?: string | null } = {};

    if (name?.trim()) {
      data.name = name.trim();
    }

    if (domain?.trim()) {
      const normalizedDomain = domain.trim().toLowerCase();
      if (normalizedDomain !== company.domain) {
        const existing = await prisma.company.findUnique({
          where: { domain: normalizedDomain },
        });
        if (existing) {
          return NextResponse.json(
            { error: "A company with this domain already exists" },
            { status: 409 }
          );
        }
        data.domain = normalizedDomain;
      }
    }

    if (removeLogo && company.logoPath) {
      try {
        await deleteFile(company.logoPath);
      } catch {
        // Best effort — logo may already be gone
      }
      data.logoPath = null;
    } else if (logo && logo.size > 0) {
      const driveConnected = await isGoogleDriveConnected();
      if (driveConnected) {
        // Delete old logo if exists
        if (company.logoPath) {
          try {
            await deleteFile(company.logoPath);
          } catch {
            // Best effort
          }
        }
        const rootId = await findOrCreateRootFolder();
        const assetsId = await createFolder("_company_logos", rootId);
        const bytes = await logo.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const effectiveDomain = data.domain || company.domain;
        const result = await uploadFileToFolder(
          assetsId,
          `${effectiveDomain}_logo_${logo.name}`,
          logo.type || "image/png",
          buffer
        );
        data.logoPath = result.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ message: "Nothing to update" });
    }

    await prisma.company.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ message: "Company updated" });
  } catch (error) {
    console.error("Company update error:", error);
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
    const company = await prisma.company.findUnique({
      where: { id: params.id },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Delete logo from Drive if exists
    if (company.logoPath) {
      try {
        await deleteFile(company.logoPath);
      } catch {
        // Best effort
      }
    }

    // Unlink users from this company
    await prisma.user.updateMany({
      where: { companyId: params.id },
      data: { companyId: null },
    });

    await prisma.company.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Company deleted" });
  } catch (error) {
    console.error("Company delete error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
