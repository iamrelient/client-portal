import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findOrCreateRootFolder,
  createFolder,
  uploadFileToFolder,
  isGoogleDriveConnected,
} from "@/lib/google-drive";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      domain: true,
      logoPath: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Supplement counts with domain-based email matching
  const enriched = await Promise.all(
    companies.map(async (company) => {
      const domainCount = await prisma.user.count({
        where: { email: { endsWith: `@${company.domain}` } },
      });
      return {
        ...company,
        _count: {
          users: Math.max(company._count.users, domainCount),
        },
      };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    const domain = formData.get("domain") as string | null;
    const logo = formData.get("logo") as globalThis.File | null;

    if (!name?.trim() || !domain?.trim()) {
      return NextResponse.json(
        { error: "Name and domain are required" },
        { status: 400 }
      );
    }

    const normalizedDomain = domain.trim().toLowerCase();

    const existing = await prisma.company.findUnique({
      where: { domain: normalizedDomain },
    });

    if (existing) {
      return NextResponse.json(
        { error: "A company with this domain already exists" },
        { status: 409 }
      );
    }

    let logoPath: string | null = null;

    if (logo && logo.size > 0) {
      const driveConnected = await isGoogleDriveConnected();
      if (driveConnected) {
        const rootId = await findOrCreateRootFolder();
        const assetsId = await createFolder("_company_logos", rootId);
        const bytes = await logo.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const result = await uploadFileToFolder(
          assetsId,
          `${normalizedDomain}_logo_${logo.name}`,
          logo.type || "image/png",
          buffer
        );
        logoPath = result.id;
      }
    }

    const company = await prisma.company.create({
      data: {
        name: name.trim(),
        domain: normalizedDomain,
        logoPath,
      },
    });

    // Backfill: link existing users whose email matches this domain
    await prisma.user.updateMany({
      where: {
        email: { endsWith: `@${normalizedDomain}` },
        companyId: null,
      },
      data: { companyId: company.id },
    });

    return NextResponse.json(
      { message: "Company created", companyId: company.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Company creation error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
