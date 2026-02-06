"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

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
    setFormError("");
    setFormSuccess("");
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
        setFormError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }

      setFormSuccess(`User ${email} created successfully`);
      setCreating(false);
      (e.target as HTMLFormElement).reset();
      loadUsers();
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
        title="User Management"
        description={`${users.length} registered user${users.length !== 1 ? "s" : ""}`}
      />

      {/* Create User Section */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => {
            setFormOpen(!formOpen);
            setFormError("");
            setFormSuccess("");
          }}
          className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
        >
          Create New User
          {formOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {formOpen && (
          <form onSubmit={handleCreateUser} className="border-t border-slate-200 px-6 py-4">
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
                  Full name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Min. 8 characters"
                />
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-700">
                  Company <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Acme Inc."
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
                  "Create User"
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium text-slate-500">User</th>
                <th className="px-6 py-3 font-medium text-slate-500">Role</th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Company
                </th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Status
                </th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Activities
                </th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Last Login
                </th>
                <th className="px-6 py-3 font-medium text-slate-500">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.role === "ADMIN"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {user.company || "--"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
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
                  <td className="px-6 py-4 text-slate-600">
                    {user._count.activities}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    No users found
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
