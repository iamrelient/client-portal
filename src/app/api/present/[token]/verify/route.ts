import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const presentation = await prisma.presentation.findUnique({
      where: { accessToken: params.token },
    });

    if (!presentation) {
      return NextResponse.json(
        { error: "Presentation not found" },
        { status: 404 }
      );
    }

    if (!presentation.isActive) {
      return NextResponse.json(
        { error: "This presentation is no longer available" },
        { status: 403 }
      );
    }

    if (presentation.expiresAt && new Date() > presentation.expiresAt) {
      return NextResponse.json(
        { error: "This presentation has expired" },
        { status: 403 }
      );
    }

    if (!presentation.password) {
      return NextResponse.json({ success: true });
    }

    const { password } = await req.json();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const { compare } = await import("bcryptjs");
    const valid = await compare(password, presentation.password);

    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    // Set short-lived cookie (24 hours)
    const response = NextResponse.json({ success: true });
    response.cookies.set(`pres_${presentation.id}`, presentation.id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Verify password error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
