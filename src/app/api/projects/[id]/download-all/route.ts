import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { downloadFile } from "@/lib/google-drive";
import { FileCategory } from "@prisma/client";
import JSZip from "jszip";

const CATEGORY_FOLDERS: Record<string, string> = {
  RENDER: "Renders",
  DRAWING: "Drawings",
  CAD_DRAWING: "CAD Drawings",
  SUPPORTING: "Owner Provided",
  DESIGN_INSPIRATION: "Design Inspirations",
  OTHER: "Other",
};

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const categoriesParam = url.searchParams.get("categories");
    const includeOldVersions = url.searchParams.get("includeOldVersions") === "true";

    // Parse category filter
    const categoryFilter = categoriesParam
      ? (categoriesParam.split(",").filter(Boolean) as FileCategory[])
      : null;

    // Build file filter
    const fileWhere: Record<string, unknown> = {
      presentationSections: { none: {} },
    };
    if (categoryFilter) {
      fileWhere.category = { in: categoryFilter };
    }
    if (!includeOldVersions) {
      fileWhere.isCurrent = true;
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        files: {
          where: fileWhere,
          select: {
            id: true,
            originalName: true,
            path: true,
            mimeType: true,
            category: true,
            isCurrent: true,
            version: true,
            fileGroupId: true,
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
        { error: "No files to download" },
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

        if (includeOldVersions) {
          // When including old versions, add version suffix and separate old versions
          const ext = file.originalName.includes(".")
            ? "." + file.originalName.split(".").pop()
            : "";
          const baseName = file.originalName.includes(".")
            ? file.originalName.slice(0, file.originalName.lastIndexOf("."))
            : file.originalName;

          if (file.isCurrent) {
            // Current files go in category root with version suffix
            const versionedName =
              file.version > 1
                ? `${baseName}_v${file.version}${ext}`
                : `${baseName}${ext}`;
            zip.file(`${folder}/${versionedName}`, buffer);
          } else {
            // Old versions go in "Old Versions" subfolder
            const versionedName = `${baseName}_v${file.version}${ext}`;
            zip.file(`${folder}/Old Versions/${versionedName}`, buffer);
          }
        } else {
          // Standard behavior: just current files, no version suffix
          zip.file(`${folder}/${file.originalName}`, buffer);
        }
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
