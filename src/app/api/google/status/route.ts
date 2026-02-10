import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const token = await prisma.googleToken.findUnique({
    where: { id: "singleton" },
    select: { email: true },
  });

  if (token) {
    return NextResponse.json({ connected: true, email: token.email });
  }

  return NextResponse.json({ connected: false });
}
