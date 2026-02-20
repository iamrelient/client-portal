"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import { TableSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import { formatRelativeDate } from "@/lib/format-date";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  company: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  _count: { activities: number };
}

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  function loadUsers() {
    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const company = formData.get("company") as string;

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, company }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      toast.success(`User ${email} created successfully`);
      setCreating(false);
      (e.target as HTMLFormElement).reset();
      loadUsers();
    } catch {
      toast.error("Something went wrong");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="User Management" description="Loading..." />
        <TableSkeleton rows={4} cols={7} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description={`${users.length} registered user${users.length !== 1 ? "s" : ""}`}
      />

      {/* Create User Section */}
      <div className="mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.03] transition-colors"
        >
          Create New User
          {formOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {formOpen && (
          <form onSubmit={handleCreateUser} className="border-t border-white/[0.06] px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300">
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-300">
                  Company <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Acme Inc."
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
                  "Create User"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="px-6 py-3 font-medium text-slate-400">User</th>
                <th className="px-6 py-3 font-medium text-slate-400">Role</th>
                <th className="px-6 py-3 font-medium text-slate-400">Company</th>
                <th className="px-6 py-3 font-medium text-slate-400">Status</th>
                <th className="px-6 py-3 font-medium text-slate-400">Activities</th>
                <th className="px-6 py-3 font-medium text-slate-400">Last Login</th>
                <th className="px-6 py-3 font-medium text-slate-400">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-100">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.role === "ADMIN"
                          ? "bg-purple-500/10 text-purple-400"
                          : "bg-brand-500/10 text-brand-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {user.company || "--"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          user.isActive ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {user._count.activities}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {user.lastLoginAt
                      ? formatRelativeDate(user.lastLoginAt)
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {formatRelativeDate(user.createdAt)}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Users}
                      title="No users found"
                      description="Create your first user using the form above"
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
