"use client";

import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account preferences."
      />

      <div className="max-w-2xl space-y-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Profile Information
          </h2>
          <form className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                defaultValue={session?.user?.name || ""}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="settings-email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="settings-email"
                type="email"
                defaultValue={session?.user?.email || ""}
                disabled
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Contact support to change your email address.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Change Password
          </h2>
          <form className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium text-slate-700"
              >
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Update password
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-red-600">
            Danger Zone
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <button
            type="button"
            className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}
