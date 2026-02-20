"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronUp, FolderOpen, Loader2 } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";
import { compressImage } from "@/lib/compress-image";

interface ProjectRow {
  id: string;
  name: string;
  company: string | null;
  thumbnailPath: string | null;
  authorizedEmails: string[];
  createdAt: string;
  _count: { files: number };
}

export default function AdminProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  function loadProjects() {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);

    const formData = new FormData(e.currentTarget);

    // Compress images before uploading
    const thumbnail = formData.get("thumbnail") as File | null;
    if (thumbnail && thumbnail.size > 0) {
      formData.set("thumbnail", await compressImage(thumbnail));
    }
    const companyLogo = formData.get("companyLogo") as File | null;
    if (companyLogo && companyLogo.size > 0) {
      formData.set("companyLogo", await compressImage(companyLogo));
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      toast.success("Project created successfully");
      setCreating(false);
      (e.target as HTMLFormElement).reset();
      loadProjects();
    } catch {
      toast.error("Something went wrong");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Projects" description="Loading..." />
        <TableSkeleton rows={4} cols={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
      />

      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.03] transition-colors"
        >
          Create New Project
          {formOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {formOpen && (
          <form onSubmit={handleCreate} className="border-t border-white/[0.06] px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                  Project name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="My Project"
                />
              </div>
              <div>
                <label htmlFor="thumbnail" className="block text-sm font-medium text-slate-300">
                  Thumbnail image <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="thumbnail"
                  name="thumbnail"
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-400 hover:file:bg-brand-500/20"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-300">
                  Company name <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label htmlFor="companyLogo" className="block text-sm font-medium text-slate-300">
                  Company logo <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="companyLogo"
                  name="companyLogo"
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500/10 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-brand-400 hover:file:bg-brand-500/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="emails" className="block text-sm font-medium text-slate-300">
                  Authorized access <span className="font-normal text-slate-400">(emails or @domain.com, comma-separated)</span>
                </label>
                <textarea
                  id="emails"
                  name="emails"
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="client@example.com, @acmecorp.com"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create Project"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-3 font-medium text-slate-400">Project</th>
                <th className="px-6 py-3 font-medium text-slate-400">Company</th>
                <th className="px-6 py-3 font-medium text-slate-400">Files</th>
                <th className="px-6 py-3 font-medium text-slate-400">Access</th>
                <th className="px-6 py-3 font-medium text-slate-400">Created</th>
                <th className="px-6 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-100">{project.name}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {project.company || "--"}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {project._count.files}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    <span className="max-w-[200px] truncate block">
                      {project.authorizedEmails.length > 0
                        ? project.authorizedEmails.join(", ")
                        : "--"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {formatRelativeDate(project.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => router.push(`/admin/projects/${project.id}`)}
                      className="text-sm font-medium text-brand-400 hover:text-brand-300"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={FolderOpen}
                      title="No projects yet"
                      description="Create your first project using the form above"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
