import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(
  _req: Request,
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

    const newToken = crypto.randomBytes(32).toString("hex");

    const updated = await prisma.presentation.update({
      where: { id: params.id },
      data: { accessToken: newToken },
    });

    return NextResponse.json({ accessToken: updated.accessToken });
  } catch (error) {
    console.error("Regenerate share link error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
