"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

function RegisteredBanner() {
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  if (!registered) return null;

  return (
    <div className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
      Account created successfully. Sign in below.
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      if (!res.ok) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      const callbackUrl = searchParams.get("callbackUrl");
      const redirect =
        callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
      window.location.href = redirect;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl"
    >
      <Suspense>
        <RegisteredBanner />
      </Suspense>
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-300"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-300"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 block w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Enter your password"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center">
        <input
          id="rememberMe"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-brand-600 focus:ring-brand-500 focus:ring-offset-0"
        />
        <label
          htmlFor="rememberMe"
          className="ml-2 text-sm text-slate-400"
        >
          Remember me
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-900 flex-col items-center justify-center p-12">
        <img
          src="/logo-horizontal.png"
          alt="Ray Renders"
          className="h-16 mb-8"
        />
        <h1 className="text-3xl font-bold text-white text-center">
          Client Portal
        </h1>
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
          {/* Mobile logo — shown only on small screens */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/" className="inline-flex items-center justify-center rounded-xl bg-brand-900 px-6 py-3">
              <img
                src="/logo-horizontal.png"
                alt="Ray Renders"
                className="h-10"
              />
            </Link>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-100">
              Sign in to your account
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-brand-600 hover:text-brand-500 font-medium">
                Sign up
              </Link>
            </p>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
