"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, Copy, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CardSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { getStatusLabel, getStatusColorClass } from "@/lib/project-status";
import { BlurImage } from "@/components/blur-image";
import { formatRelativeDate } from "@/lib/format-date";

interface ProjectCard {
  id: string;
  name: string;
  status: string;
  company: string | null;
  thumbnailPath: string | null;
  createdAt: string;
  updatedAt: string;
  lastFileAt: string | null;
  _count: { files: number };
}

function isRecentlyUpdated(lastFileAt: string | null): boolean {
  if (!lastFileAt) return false;
  const diff = Date.now() - new Date(lastFileAt).getTime();
  return diff < 24 * 60 * 60 * 1000; // 24 hours
}

function copyProjectLink(
  project: ProjectCard,
  setCopiedId: (id: string | null) => void
) {
  const slug = project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const url = `${window.location.origin}/p/${project.id}/${slug}`;

  const thumbUrl = project.thumbnailPath
    ? `${window.location.origin}/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailPath)}`
    : null;

  const thumbCell = thumbUrl
    ? `<td width="40" style="width:40px;padding:0;vertical-align:middle;"><img src="${thumbUrl}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:4px;" /></td>`
    : `<td width="40" style="width:40px;padding:0;vertical-align:middle;"><div style="width:40px;height:40px;background:linear-gradient(135deg,#1e3a5f,#2d6a9f);border-radius:4px;text-align:center;line-height:40px;color:#fff;font-weight:700;font-size:16px;font-family:Arial,sans-serif;">${project.name.charAt(0).toUpperCase()}</div></td>`;

  const textParts = [
    `<a href="${url}" style="color:#1e3a5f;text-decoration:none;font-weight:600;font-size:13px;line-height:1.2;">${project.name}</a>`,
    project.company ? `<span style="font-size:11px;color:#6b7280;">${project.company}</span>` : null,
  ].filter(Boolean).join(`<br/>`);

  const html = `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;"><tr>${thumbCell}<td style="padding:0 0 0 10px;vertical-align:middle;">${textParts}</td></tr></table>`;

  const clipboardItem = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([url], { type: "text/plain" }),
  });

  navigator.clipboard.write([clipboardItem]);
  setCopiedId(project.id);
  setTimeout(() => setCopiedId(null), 2000);
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        const mapped = (data as Array<Record<string, unknown>>).map((p) => ({
          ...p,
          lastFileAt:
            (p.files as Array<{ createdAt: string }> | undefined)?.[0]
              ?.createdAt ?? null,
        }));
        setProjects(mapped as unknown as ProjectCard[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const { active, completed } = useMemo(() => {
    const active: ProjectCard[] = [];
    const completed: ProjectCard[] = [];
    for (const p of projects) {
      if (p.status === "complete") {
        completed.push(p);
      } else {
        active.push(p);
      }
    }
    return { active, completed };
  }, [projects]);

  if (loading) {
    return (
      <div>
        <PageHeader
          title={`Welcome back, ${session?.user?.name?.split(" ")[0] || "User"}`}
          description="Here are your projects."
        />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${session?.user?.name?.split(" ")[0] || "User"}`}
        description="Here are your projects."
      />

      {projects.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Your projects will appear here"
          />
        </div>
      ) : (
        <>
          {/* Active projects — standard card grid */}
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((project) => (
                <div key={project.id} className="relative">
                  <Link href={isAdmin ? `/admin/projects/${project.id}` : `/dashboard/projects/${project.id}`}>
                    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.05] hover:border-brand-500/30 hover:shadow-[0_0_20px_rgba(74,97,153,0.15)] transition-all duration-300">
                      <div className="relative aspect-video bg-white/[0.02]">
                        {project.thumbnailPath ? (
                          <BlurImage
                            src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailPath)}`}
                            alt={project.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ProjectThumbnail name={project.name} />
                        )}
                        {isRecentlyUpdated(project.lastFileAt) && (
                          <span className="absolute top-2 left-2 inline-flex items-center rounded-full bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                            Recently Updated
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-100">{project.name}</h3>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColorClass(project.status)}`}
                          >
                            {getStatusLabel(project.status)}
                          </span>
                        </div>
                        {project.company && (
                          <p className="mt-0.5 text-sm text-slate-400">{project.company}</p>
                        )}
                        <p className="mt-1 text-sm text-slate-400">
                          {project._count.files} file{project._count.files !== 1 ? "s" : ""}
                        </p>
                        {project.updatedAt && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Updated {formatRelativeDate(project.updatedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        copyProjectLink(project, setCopiedId);
                      }}
                      className="absolute top-2 right-2 rounded-lg bg-black/60 p-1.5 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur-sm transition-colors"
                      title="Copy client link"
                    >
                      {copiedId === project.id ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Completed projects — compact horizontal rows */}
          {completed.length > 0 && (
            <div className={active.length > 0 ? "mt-10" : ""}>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-500">
                Completed
              </h2>
              <div className="space-y-2">
                {completed.map((project) => (
                  <div key={project.id} className="relative">
                    <Link href={isAdmin ? `/admin/projects/${project.id}` : `/dashboard/projects/${project.id}`}>
                      <div className="flex items-center gap-4 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl px-4 py-3 hover:bg-white/[0.05] hover:border-brand-500/30 transition-all duration-300">
                        <div className="h-10 w-16 flex-shrink-0 overflow-hidden rounded-md bg-white/[0.02]">
                          {project.thumbnailPath ? (
                            <BlurImage
                              src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailPath)}`}
                              alt={project.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ProjectThumbnail name={project.name} compact />
                          )}
                        </div>
                        <h3 className="flex-1 truncate font-medium text-sm text-slate-300">
                          {project.name}
                        </h3>
                        {project.company && (
                          <span className="hidden sm:block text-xs text-slate-500 truncate max-w-[140px]">
                            {project.company}
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusColorClass(project.status)}`}>
                          {getStatusLabel(project.status)}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              copyProjectLink(project, setCopiedId);
                            }}
                            className="flex-shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300 transition-colors"
                            title="Copy client link"
                          >
                            {copiedId === project.id ? (
                              <Check className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
