"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          Invalid reset link. Please request a new password reset.
        </div>
        <Link
          href="/forgot-password"
          className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Request new reset
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div>
        <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
          Your password has been reset successfully.
        </div>
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-300">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Re-enter your password"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset password"}
      </button>

      <p className="mt-4 text-center text-sm text-slate-400">
        <Link href="/login" className="text-brand-600 hover:text-brand-500 font-medium">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-900 flex-col items-center justify-center p-12">
        <img src="/logo-horizontal.png" alt="Ray Renders" className="h-16 mb-8" />
        <h1 className="text-3xl font-bold text-white text-center">Client Portal</h1>
        <p className="mt-3 text-brand-300 text-center max-w-sm">
          Access your projects, files, and collaborate with the Ray Renders team.
        </p>
        <p className="absolute bottom-8 text-sm text-brand-400">
          &copy; {new Date().getFullYear()} Ray Renders LLC
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center bg-[#0a0a0f] px-4">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-brand-900 px-6 py-3">
              <img src="/logo-horizontal.png" alt="Ray Renders" className="h-10" />
            </Link>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-100">Set a new password</h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter your new password below.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
            <Suspense>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
