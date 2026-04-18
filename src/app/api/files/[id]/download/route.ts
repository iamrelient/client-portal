import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { hasStudioAccess } from "@/lib/roles";
import { downloadFile } from "@/lib/google-drive";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: params.id },
      include: { project: { select: { authorizedEmails: true } } },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (
      file.project &&
      !hasStudioAccess(session.user.role) &&
      !isEmailAuthorized(
        session.user.email ?? "",
        file.project.authorizedEmails
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Track file view (fire-and-forget)
    prisma.fileView.create({
      data: { fileId: file.id, userId: session.user.id },
    }).catch(() => {});

    // path stores the Drive file ID
    const { stream } = await downloadFile(file.path);

    // Handle .url shortcut files — parse the URL and redirect
    if (file.originalName.toLowerCase().endsWith(".url")) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.value) chunks.push(result.value);
        done = result.done;
      }
      const text = new TextDecoder().decode(Buffer.concat(chunks));
      const urlMatch = text.match(/URL=(.+)/i);
      if (urlMatch) {
        const targetUrl = urlMatch[1].trim();
        return NextResponse.redirect(targetUrl);
      }
      // If we can't parse it, fall through to download as-is
    }

    // Support inline viewing via ?inline=true query param
    const url = new URL(req.url);
    const inline = url.searchParams.get("inline") === "true";
    const disposition = inline
      ? `inline; filename="${file.originalName}"`
      : `attachment; filename="${file.originalName}"`;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": disposition,
        "Content-Length": String(file.size),
        "Cache-Control": inline
          ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
          : "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error) {
    console.error("File download error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
