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

    // 30 days if "remember me", 24 hours otherwise
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;

    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge, // JWT exp must match cookie maxAge
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

    const isSecure =
      req.headers.get("x-forwarded-proto") === "https" ||
      process.env.NEXTAUTH_URL?.startsWith("https://");
    const cookieName = isSecure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    const res = NextResponse.json({ ok: true });

    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge,
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }
}
