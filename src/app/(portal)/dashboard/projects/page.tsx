"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FolderOpen } from "lucide-react";
import { CardSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ProjectThumbnail } from "@/components/project-thumbnail";
import { getStatusLabel } from "@/lib/project-status";
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

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);

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
        <PageHeader title="Projects" description="Your authorized projects" />
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
        title="Projects"
        description="Your authorized projects"
      />

      {projects.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Your authorized projects will appear here"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.05] transition-shadow">
                <div className="aspect-video bg-white/[0.02]">
                  {project.thumbnailPath ? (
                    <BlurImage
                      src={`/api/projects/${project.id}/thumbnail`}
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
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        project.status === "complete"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-brand-500/10 text-brand-400"
                      }`}
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
          ))}
        </div>
      )}
    </div>
  );
}
