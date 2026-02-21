"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  logoPath: string | null;
  createdAt: string;
  _count: { users: number };
}

export default function AdminCompaniesPage() {
  const toast = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editLogo, setEditLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadCompanies() {
    fetch("/api/admin/companies")
      .then((res) => res.json())
      .then((data) => {
        setCompanies(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      toast.success("Company created successfully");
      setCreating(false);
      form.reset();
      loadCompanies();
    } catch {
      toast.error("Something went wrong");
      setCreating(false);
    }
  }

  function startEdit(company: CompanyRow) {
    setEditingId(company.id);
    setEditName(company.name);
    setEditDomain(company.domain);
    setEditLogo(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDomain("");
    setEditLogo(null);
  }

  async function handleSave(id: string) {
    setSaving(true);

    const formData = new FormData();
    formData.append("name", editName);
    formData.append("domain", editDomain);
    if (editLogo) {
      formData.append("logo", editLogo);
    }

    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: "PATCH",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setSaving(false);
        return;
      }

      toast.success("Company updated");
      cancelEdit();
      loadCompanies();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this company? Users will be unlinked.")) return;
    setDeletingId(id);

    try {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setDeletingId(null);
        return;
      }

      toast.success("Company deleted");
      loadCompanies();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Companies" description="Loading..." />
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Companies"
        description={`${companies.length} compan${companies.length !== 1 ? "ies" : "y"}`}
      />

      {/* Create Company Section */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.03] transition-colors"
        >
          Create New Company
          {formOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {formOpen && (
          <form
            onSubmit={handleCreate}
            className="border-t border-white/[0.06] px-6 py-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-slate-300"
                >
                  Company name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label
                  htmlFor="domain"
                  className="block text-sm font-medium text-slate-300"
                >
                  Email domain
                </label>
                <input
                  id="domain"
                  name="domain"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="acmecorp.com"
                />
              </div>
              <div>
                <label
                  htmlFor="logo"
                  className="block text-sm font-medium text-slate-300"
                >
                  Logo{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/*"
                  className="mt-1 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 file:cursor-pointer"
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
                  "Create Company"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Companies Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-3 font-medium text-slate-400">
                  Company
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Domain
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">Logo</th>
                <th className="px-6 py-3 font-medium text-slate-400">Users</th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Created
                </th>
                <th className="px-6 py-3 font-medium text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {companies.map((company) => (
                <tr
                  key={company.id}
                  className="hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-6 py-4">
                    {editingId === company.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      <p className="font-medium text-slate-100">
                        {company.name}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === company.id ? (
                      <input
                        type="text"
                        value={editDomain}
                        onChange={(e) => setEditDomain(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      <span className="text-slate-400">{company.domain}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === company.id ? (
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setEditLogo(e.target.files?.[0] ?? null)
                        }
                        className="w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-brand-600 file:px-2 file:py-1 file:text-xs file:text-white file:cursor-pointer"
                      />
                    ) : company.logoPath ? (
                      <img
                        src={`/api/companies/${company.id}/logo`}
                        alt={`${company.name} logo`}
                        className="h-8 w-8 rounded object-contain bg-white/[0.05]"
                      />
                    ) : (
                      <span className="text-slate-500">--</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {company._count.users}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {formatRelativeDate(company.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    {editingId === company.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSave(company.id)}
                          disabled={saving}
                          className="inline-flex items-center rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.05] hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(company)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.05] hover:text-white"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(company.id)}
                          disabled={deletingId === company.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === company.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={Building2}
                      title="No companies yet"
                      description="Create your first company using the form above"
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
