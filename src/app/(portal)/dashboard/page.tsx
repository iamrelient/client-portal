"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Check, Copy, FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CardSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { getStatusLabel, getStatusColorClass } from "@/lib/project-status";
import { BlurImage } from "@/components/blur-image";

interface ProjectCard {
  id: string;
  name: string;
  status: string;
  company: string | null;
  thumbnailPath: string | null;
  createdAt: string;
  _count: { files: number };
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
        setProjects(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div key={project.id} className="relative">
              <Link href={isAdmin ? `/admin/projects/${project.id}` : `/dashboard/projects/${project.id}`}>
                <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.05] hover:border-brand-500/30 hover:shadow-[0_0_20px_rgba(74,97,153,0.15)] transition-all duration-300">
                  <div className="aspect-video bg-white/[0.02]">
                    {project.thumbnailPath ? (
                      <BlurImage
                        src={`/api/projects/${project.id}/thumbnail?v=${encodeURIComponent(project.thumbnailPath)}`}
                        alt={project.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ProjectThumbnail name={project.name} />
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
                  </div>
                </div>
              </Link>
              {isAdmin && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    const url = `${window.location.origin}/dashboard/projects/${project.id}/${slug}`;
                    navigator.clipboard.writeText(url);
                    setCopiedId(project.id);
                    setTimeout(() => setCopiedId(null), 2000);
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
    </div>
  );
}
