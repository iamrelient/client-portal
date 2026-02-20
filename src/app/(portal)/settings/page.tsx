"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Loader2 } from "lucide-react";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/components/toast";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { data: session, update: updateSession } = useSession();
  const searchParams = useSearchParams();
  const toast = useToast();
  const isAdmin = session?.user?.role === "ADMIN";

  // Google Drive state
  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    email?: string;
  } | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);

  // Profile state
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete account state
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Initialize form from session
  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setCompany(session.user.company || "");
      setPhone(session.user.phone || "");
    }
  }, [session]);

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
      toast.success("Google Drive connected successfully!");
      setDriveStatus(null);
      fetch("/api/google/status")
        .then((res) => res.json())
        .then(setDriveStatus)
        .catch(() => {});
    } else if (googleParam === "error") {
      toast.error("Failed to connect Google Drive. Please try again.");
    }
  }, [searchParams]);

  async function handleDisconnect() {
    setDriveLoading(true);
    try {
      await fetch("/api/google/disconnect", { method: "POST" });
      setDriveStatus({ connected: false });
      toast.info("Google Drive disconnected.");
    } catch {
      toast.error("Failed to disconnect.");
    }
    setDriveLoading(false);
    setShowDisconnect(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await updateSession();
      toast.success("Profile updated successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile.");
    }
    setProfileLoading(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password updated successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password.");
    }
    setPasswordLoading(false);
  }

  async function handleDeleteAccount() {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/settings/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleteLoading(false);
      setShowDeleteAccount(false);
    }
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
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-100">
              Google Drive
            </h2>
            <p className="mb-4 text-sm text-slate-400">
              Connect Google Drive to store all project files. Files uploaded through the portal go to Drive,
              and files added to Drive appear automatically in the portal.
            </p>

            {driveStatus === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking connection...
              </div>
            ) : driveStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-300">
                    Connected as <strong>{driveStatus.email}</strong>
                  </span>
                </div>
                <button
                  onClick={() => setShowDisconnect(true)}
                  disabled={driveLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
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

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">
            Profile Information
          </h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-300"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-slate-300"
              >
                Company
              </label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-slate-300"
              >
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label
                htmlFor="settings-email"
                className="block text-sm font-medium text-slate-300"
              >
                Email
              </label>
              <input
                id="settings-email"
                type="email"
                defaultValue={session?.user?.email || ""}
                disabled
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-slate-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Contact support to change your email address.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={profileLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {profileLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">
            Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium text-slate-300"
              >
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-slate-300"
              >
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {passwordLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </div>
          </form>
        </div>

        {!isAdmin && (
          <div className="rounded-xl border border-red-500/20 bg-white/[0.03] p-6 backdrop-blur-xl">
            <h2 className="mb-2 text-lg font-semibold text-red-400">
              Danger Zone
            </h2>
            <p className="mb-4 text-sm text-slate-400">
              Permanently delete your account and all associated data. This action
              cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText("");
                setShowDeleteAccount(true);
              }}
              className="rounded-lg border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete account
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={showDisconnect}
        title="Disconnect Google Drive"
        message="Existing files will remain in Drive but new uploads won't work until reconnected."
        confirmLabel="Disconnect"
        variant="danger"
        loading={driveLoading}
        onConfirm={handleDisconnect}
        onCancel={() => setShowDisconnect(false)}
      />

      {showDeleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-white/[0.08] bg-[#12141f] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100">Delete Account</h3>
            <p className="mt-2 text-sm text-slate-400">
              This will permanently delete your account and all associated data.
              This action cannot be undone.
            </p>
            <p className="mt-4 text-sm text-slate-300">
              Type <span className="font-mono font-semibold text-red-400">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-2 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteAccount(false)}
                className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== "DELETE" || deleteLoading}
                onClick={handleDeleteAccount}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete my account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
