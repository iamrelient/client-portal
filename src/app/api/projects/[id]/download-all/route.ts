import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEmailAuthorized } from "@/lib/auth-utils";
import { downloadFile } from "@/lib/google-drive";
import { FileCategory } from "@prisma/client";
import JSZip from "jszip";

// Zipping many/large files from Drive easily exceeds the 10s Vercel Hobby
// default. 60s is the Hobby-plan ceiling.
export const maxDuration = 60;

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
    const customCategoriesParam = url.searchParams.get("customCategories");
    const fileIdsParam = url.searchParams.get("fileIds");
    const includeOldVersions = url.searchParams.get("includeOldVersions") === "true";

    // Parse filters
    const categoryFilter = categoriesParam
      ? (categoriesParam.split(",").filter(Boolean) as FileCategory[])
      : null;
    const customCategoryFilter = customCategoriesParam
      ? customCategoriesParam.split(",").filter(Boolean)
      : null;
    const fileIdsFilter = fileIdsParam
      ? fileIdsParam.split(",").filter(Boolean)
      : null;

    // Build file filter
    const fileWhere: Record<string, unknown> = {
      presentationSections: { none: {} },
    };

    // Explicit fileIds take precedence: user selected specific files, zip exactly those.
    if (fileIdsFilter) {
      if (fileIdsFilter.length === 0) {
        return NextResponse.json(
          { error: "No files selected" },
          { status: 400 }
        );
      }
      fileWhere.id = { in: fileIdsFilter };
    } else if (categoryFilter || customCategoryFilter) {
      // When either filter is present, match files in (standard categories) OR (custom categories).
      // Files with a customCategory set are stored as category OTHER in the DB but
      // should only match the custom filter, not the standard OTHER filter.
      const orClauses: Record<string, unknown>[] = [];
      if (categoryFilter && categoryFilter.length > 0) {
        orClauses.push({
          category: { in: categoryFilter },
          customCategory: null,
        });
      }
      if (customCategoryFilter && customCategoryFilter.length > 0) {
        orClauses.push({
          customCategory: { in: customCategoryFilter },
        });
      }
      if (orClauses.length > 0) {
        fileWhere.OR = orClauses;
      } else {
        // Both filters present but empty — match nothing
        fileWhere.id = "__none__";
      }
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
            customCategory: true,
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

    // Compute the highest version per fileGroupId so we can identify "latest"
    // without relying on isCurrent (which now means "featured").
    const maxVersionByGroup = new Map<string, number>();
    for (const f of project.files) {
      const key = f.fileGroupId || f.id;
      const prev = maxVersionByGroup.get(key) ?? 0;
      if (f.version > prev) maxVersionByGroup.set(key, f.version);
    }

    // Explicit file selections bypass version filtering — user chose those exact rows.
    const filesToZip = fileIdsFilter || includeOldVersions
      ? project.files
      : project.files.filter(
          (f) => f.version === maxVersionByGroup.get(f.fileGroupId || f.id)
        );

    if (filesToZip.length === 0) {
      return NextResponse.json(
        { error: "No files to download" },
        { status: 400 }
      );
    }

    const zip = new JSZip();

    for (const file of filesToZip) {
      const isLatestInGroup =
        file.version === maxVersionByGroup.get(file.fileGroupId || file.id);
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

        // Custom categories take precedence over standard category folders
        const folder = file.customCategory
          ? file.customCategory.replace(/[/\\:*?"<>|]/g, "_")
          : CATEGORY_FOLDERS[file.category] || "Other";

        if (includeOldVersions) {
          // When including old versions, add version suffix and separate old versions
          const ext = file.originalName.includes(".")
            ? "." + file.originalName.split(".").pop()
            : "";
          const baseName = file.originalName.includes(".")
            ? file.originalName.slice(0, file.originalName.lastIndexOf("."))
            : file.originalName;

          if (isLatestInGroup) {
            // Latest versions go in category root with version suffix
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
          // Standard behavior: just latest versions, no version suffix
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
