"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  FileText,
  FolderOpen,
  Building2,
} from "lucide-react";
import { useState } from "react";

const clientLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/files", label: "Files", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminLinks = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/projects", label: "Projects", icon: FolderOpen },
  { href: "/admin/files", label: "Files", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = session?.user?.role === "ADMIN";

  const navContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center border-b border-brand-700 px-5 py-4">
        <img
          src="/logo-horizontal.png"
          alt="Ray Renders"
          className="h-8 w-auto"
        />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-brand-300">
          Client
        </p>
        {clientLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "bg-brand-500/20 text-white"
                  : "text-brand-200 hover:bg-brand-600/30 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-brand-300">
              Admin
            </p>
            {adminLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-brand-500/20 text-white"
                      : "text-brand-200 hover:bg-brand-600/30 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-brand-700 p-4">
        {session?.user?.companyLogoId && session?.user?.companyId && (
          <div className="mb-3 flex justify-center px-2">
            <img
              src={`/api/companies/${session.user.companyId}/logo`}
              alt="Company logo"
              className="h-10 w-auto max-w-[140px] rounded object-contain"
            />
          </div>
        )}
        <div className="mb-3 px-2">
          <p className="text-sm font-medium text-white truncate">
            {session?.user?.name}
          </p>
          <p className="text-xs text-brand-300 truncate">
            {session?.user?.email}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-200 transition-colors hover:bg-brand-600/30 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-brand-800 p-2 text-white lg:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-brand-900 transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
