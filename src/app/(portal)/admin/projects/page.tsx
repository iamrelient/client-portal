"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  thumbnailPath: string | null;
  authorizedEmails: string[];
  createdAt: string;
  _count: { files: number };
}

export default function AdminProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

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
    setFormError("");
    setFormSuccess("");
    setCreating(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      setFormSuccess(`Project created successfully`);
      setCreating(false);
      (e.target as HTMLFormElement).reset();
      loadProjects();
    } catch {
      setFormError("Something went wrong");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
      />

      {/* Create Project Section */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => {
            setFormOpen(!formOpen);
            setFormError("");
            setFormSuccess("");
          }}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
        >
          Create New Project
          {formOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {formOpen && (
          <form onSubmit={handleCreate} className="border-t border-slate-200 px-6 py-4">
            {formError && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
                {formSuccess}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                  Project name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="My Project"
                />
              </div>
              <div>
                <label htmlFor="thumbnail" className="block text-sm font-medium text-slate-700">
                  Thumbnail image <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="thumbnail"
                  name="thumbnail"
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="emails" className="block text-sm font-medium text-slate-700">
                  Authorized client emails <span className="font-normal text-slate-400">(comma-separated)</span>
                </label>
                <textarea
                  id="emails"
                  name="emails"
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="client@example.com, other@example.com"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
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

      {/* Projects Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">Project</th>
                <th className="px-6 py-3 font-medium text-slate-500">Files</th>
                <th className="px-6 py-3 font-medium text-slate-500">Clients</th>
                <th className="px-6 py-3 font-medium text-slate-500">Created</th>
                <th className="px-6 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{project.name}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {project._count.files}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {project.authorizedEmails.length > 0
                      ? project.authorizedEmails.join(", ")
                      : "--"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => router.push(`/admin/projects/${project.id}`)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No projects yet
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
