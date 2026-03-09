import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      // Still return 200 to not reveal validation details
      return NextResponse.json({ ok: true });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.isActive) {
      // Delete any existing reset tokens for this email
      await prisma.verificationToken.deleteMany({
        where: { identifier: normalizedEmail },
      });

      // Create a new token (1 hour expiry)
      const token = randomUUID();
      await prisma.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          token,
          expires: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      const portalUrl = process.env.NEXTAUTH_URL || "https://portal.rayrenders.com";
      const resetUrl = `${portalUrl}/reset-password?token=${token}`;

      await sendPasswordResetEmail({ email: normalizedEmail, resetUrl });
    }

    // Always return success to not reveal whether the email exists
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ ok: true });
  }
}
