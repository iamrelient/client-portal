import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractOgImage } from "@/lib/og-image";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "url parameter is required" },
      { status: 400 }
    );
  }

  try {
    const thumbnailUrl = await extractOgImage(url);
    return NextResponse.json({ thumbnailUrl });
  } catch {
    return NextResponse.json({ thumbnailUrl: null });
  }
}
