"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Ignore errors — always show success
    }

    setLoading(false);
    setSent(true);
  }

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
            <h1 className="text-2xl font-bold text-slate-100">Reset your password</h1>
            <p className="mt-2 text-sm text-slate-400">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
            {sent ? (
              <div>
                <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
                  If an account exists with that email, we&apos;ve sent a password reset link. Check your inbox.
                </div>
                <Link
                  href="/login"
                  className="mt-2 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="you@example.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send reset link"}
                </button>

                <p className="mt-4 text-center text-sm text-slate-400">
                  <Link href="/login" className="text-brand-600 hover:text-brand-500 font-medium">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
