"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { FolderOpen } from "lucide-react";

interface ProjectCard {
  id: string;
  name: string;
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
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
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
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="text-slate-500">No projects available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="aspect-video bg-slate-100">
                  {project.thumbnailPath ? (
                    <img
                      src={`/api/projects/${project.id}/thumbnail`}
                      alt={project.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FolderOpen className="h-12 w-12 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900">{project.name}</h3>
                  {project.company && (
                    <p className="mt-0.5 text-sm text-slate-500">{project.company}</p>
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
