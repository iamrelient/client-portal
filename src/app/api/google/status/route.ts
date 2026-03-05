import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const key = JSON.parse(raw);
      return NextResponse.json({ connected: true, email: key.client_email });
    } catch {
      return NextResponse.json({ connected: false });
    }
  }

  return NextResponse.json({ connected: false });
}
