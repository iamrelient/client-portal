"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";
import {
  Loader2,
  Trash2,
  Copy,
  ExternalLink,
  Plus,
  Presentation,
  Link2Off,
} from "lucide-react";

interface PresentationRow {
  id: string;
  title: string | null;
  accessToken: string;
  isActive: boolean;
  password: string | null;
  expiresAt: string | null;
  createdAt: string;
  project: { name: string };
  _count: { sections: number; accessLogs: number };
}

export default function AdminPresentationsPage() {
  const toast = useToast();
  const router = useRouter();
  const [presentations, setPresentations] = useState<PresentationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function loadPresentations() {
    fetch("/api/presentations")
      .then((res) => res.json())
      .then((data) => {
        setPresentations(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  function loadProjects() {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadPresentations();
    loadProjects();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectId) {
      toast.error("Select a project");
      return;
    }
    setCreating(true);

    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: newProjectId,
          title: newTitle || undefined,
          password: newPassword || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      toast.success("Presentation created");
      setCreating(false);
      setShowCreate(false);
      setNewProjectId("");
      setNewTitle("");
      setNewPassword("");
      loadPresentations();
      // Navigate to edit page
      router.push(`/admin/presentations/${data.id}`);
    } catch {
      toast.error("Something went wrong");
      setCreating(false);
    }
  }

  async function handleDelete(p: PresentationRow) {
    if (
      !confirm(
        `Delete presentation "${p.title || p.project.name}"?\n\nThis will permanently remove the presentation, all sections, and access logs.`
      )
    )
      return;

    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/presentations/${p.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Presentation deleted");
        loadPresentations();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setDeletingId(null);
  }

  async function handleRevoke(p: PresentationRow) {
    if (!confirm(`Revoke access for "${p.title || p.project.name}"?`)) return;

    setRevokingId(p.id);
    try {
      const res = await fetch(`/api/presentations/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (res.ok) {
        toast.success("Access revoked");
        loadPresentations();
      } else {
        toast.error("Failed to revoke");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setRevokingId(null);
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/present/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    });
  }

  function getStatus(p: PresentationRow): { label: string; cls: string } {
    if (!p.isActive) {
      return { label: "Revoked", cls: "bg-red-500/10 text-red-400" };
    }
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) {
      return { label: "Expired", cls: "bg-yellow-500/10 text-yellow-400" };
    }
    if (p.password) {
      return {
        label: "Password Protected",
        cls: "bg-brand-500/10 text-brand-400",
      };
    }
    return { label: "Active", cls: "bg-green-500/10 text-green-400" };
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Presentations" description="Loading..." />
        <TableSkeleton rows={4} cols={6} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Presentations"
        description={`${presentations.length} presentation${presentations.length !== 1 ? "s" : ""}`}
        action={
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Presentation
          </button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
          <form onSubmit={handleCreate} className="px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Project
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Title{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Defaults to project name"
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Password{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank for no password"
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-3 font-medium text-slate-400">
                  Presentation
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Status
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Sections
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Views
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Created
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {presentations.map((p) => {
                const status = getStatus(p);
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-slate-100">
                          {p.title || p.project.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {p.project.name}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {p._count.sections}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {p._count.accessLogs}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {formatRelativeDate(p.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() =>
                            router.push(`/admin/presentations/${p.id}`)
                          }
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
                          title="Edit"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>

                        {/* Copy link */}
                        {p.isActive && (
                          <button
                            onClick={() => copyLink(p.accessToken)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}

                        {/* Revoke */}
                        {p.isActive && (
                          <button
                            onClick={() => handleRevoke(p)}
                            disabled={revokingId === p.id}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-yellow-500/10 hover:text-yellow-400 disabled:opacity-50 transition-colors"
                            title="Revoke access"
                          >
                            {revokingId === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2Off className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 transition-colors"
                          title="Delete"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {presentations.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Presentation}
                      title="No presentations yet"
                      description="Create your first presentation to share with clients"
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
