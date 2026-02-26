import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { validateCredentials } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, rememberMe } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await validateCredentials(email, password);

    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      token: {
        sub: user.id,
        name: user.name,
        email: user.email,
        id: user.id,
        role: user.role,
        company: user.company,
        companyId: user.companyId,
        companyLogoId: user.companyLogoId,
        phone: user.phone,
      },
    });

    const isSecure = process.env.NEXTAUTH_URL?.startsWith("https://");
    const cookieName = isSecure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : undefined; // 30 days or session

    const res = NextResponse.json({ ok: true });

    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      ...(maxAge !== undefined && { maxAge }),
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }
}
