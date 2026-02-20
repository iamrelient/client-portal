import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { downloadFile } from "@/lib/google-drive";
import JSZip from "jszip";

const CATEGORY_FOLDERS: Record<string, string> = {
  RENDER: "Renders",
  DRAWING: "Drawings",
  OTHER: "Other",
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: {
        name: true,
        authorizedEmails: true,
        files: {
          where: { isCurrent: true },
          select: {
            id: true,
            originalName: true,
            path: true,
            mimeType: true,
            category: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (
      session.user.role !== "ADMIN" &&
      !isEmailAuthorized(session.user.email ?? "", project.authorizedEmails)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (project.files.length === 0) {
      return NextResponse.json(
        { error: "No current files to download" },
        { status: 400 }
      );
    }

    const zip = new JSZip();

    for (const file of project.files) {
      try {
        const { stream } = await downloadFile(file.path);

        // Convert ReadableStream to Buffer
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks);

        const folder = CATEGORY_FOLDERS[file.category] || "Other";
        zip.file(`${folder}/${file.originalName}`, buffer);
      } catch (err) {
        console.error(`Failed to download file ${file.id}:`, err);
        // Skip files that fail to download
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const safeName = project.name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();

    return new Response(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}_files.zip"`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  } catch (error) {
    console.error("Download all error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
