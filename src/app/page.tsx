import Link from "next/link";
import { ArrowRight, Users, BarChart3, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="Ray Renders" className="h-9 w-9 rounded-lg" />
          <span className="text-lg font-semibold text-white">Ray Renders</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/register"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6">
        <section className="pb-20 pt-20 text-center lg:pt-32">
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Your business,{" "}
            <span className="text-brand-400">organized and secure</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            A centralized portal to manage your account, track activity, and
            access everything you need in one place.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Sign in to portal
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid gap-8 pb-20 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "Secure Access",
              description:
                "Industry-standard authentication keeps your data protected with encrypted sessions.",
            },
            {
              icon: BarChart3,
              title: "Activity Tracking",
              description:
                "Monitor your account activity with a detailed timeline of all actions and events.",
            },
            {
              icon: Users,
              title: "Team Management",
              description:
                "Admins can manage users, monitor activity, and view platform analytics.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-700 bg-slate-800/50 p-8"
            >
              <div className="mb-4 inline-flex rounded-lg bg-brand-600/10 p-3">
                <feature.icon className="h-6 w-6 text-brand-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-400">
                {feature.description}
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
