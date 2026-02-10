"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const isAdmin = session?.user?.role === "ADMIN";

  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    email?: string;
  } | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/google/status")
        .then((res) => res.json())
        .then(setDriveStatus)
        .catch(() => setDriveStatus({ connected: false }));
    }
  }, [isAdmin]);

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      setDriveMessage("Google Drive connected successfully!");
      setDriveStatus(null); // Trigger re-fetch
      fetch("/api/google/status")
        .then((res) => res.json())
        .then(setDriveStatus)
        .catch(() => {});
    } else if (googleParam === "error") {
      setDriveMessage("Failed to connect Google Drive. Please try again.");
    }
  }, [searchParams]);

  async function handleDisconnect() {
    if (!confirm("Disconnect Google Drive? Existing files will remain in Drive but new uploads won't work until reconnected.")) return;
    setDriveLoading(true);
    try {
      await fetch("/api/google/disconnect", { method: "POST" });
      setDriveStatus({ connected: false });
      setDriveMessage("Google Drive disconnected.");
    } catch {
      setDriveMessage("Failed to disconnect.");
    }
    setDriveLoading(false);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account preferences."
      />

      <div className="max-w-2xl space-y-8">
        {/* Google Drive — admin only */}
        {isAdmin && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Google Drive
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Connect Google Drive to store all project files. Files uploaded through the portal go to Drive,
              and files added to Drive appear automatically in the portal.
            </p>

            {driveMessage && (
              <div
                className={`mb-4 rounded-lg p-3 text-sm ${
                  driveMessage.includes("successfully") || driveMessage.includes("connected")
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {driveMessage}
              </div>
            )}

            {driveStatus === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking connection...
              </div>
            ) : driveStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-700">
                    Connected as <strong>{driveStatus.email}</strong>
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={driveLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {driveLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Disconnect
                </button>
              </div>
            ) : (
              <a
                href="/api/google/authorize"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                Connect Google Drive
              </a>
            )}
          </div>
        )}

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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
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
