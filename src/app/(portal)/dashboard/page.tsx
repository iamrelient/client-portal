"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Activity,
  Calendar,
  Clock,
  Building2,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";

interface DashboardData {
  user: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    phone: string | null;
    role: string;
    createdAt: string;
    lastLoginAt: string | null;
    _count: { activities: number };
  };
  activities: {
    id: string;
    type: string;
    description: string;
    createdAt: string;
  }[];
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
        title={`Welcome back, ${session?.user?.name?.split(" ")[0] || "User"}`}
        description="Here's an overview of your account activity."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Activities"
          value={data?.user?._count?.activities ?? 0}
          icon={Activity}
        />
        <StatCard
          title="Account Status"
          value="Active"
          subtitle="In good standing"
          icon={Clock}
        />
        <StatCard
          title="Member Since"
          value={
            data?.user?.createdAt
              ? new Date(data.user.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })
              : "--"
          }
          icon={Calendar}
        />
        <StatCard
          title="Company"
          value={data?.user?.company || "Not set"}
          icon={Building2}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Recent Activity
            </h2>
            <ActivityFeed activities={data?.activities ?? []} />
          </div>
        </div>

        <div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Account Details
            </h2>
            <dl className="space-y-4">
              {[
                { label: "Name", value: data?.user?.name },
                { label: "Email", value: data?.user?.email },
                { label: "Company", value: data?.user?.company || "Not set" },
                { label: "Role", value: data?.user?.role },
                {
                  label: "Last Login",
                  value: data?.user?.lastLoginAt
                    ? new Date(data.user.lastLoginAt).toLocaleString()
                    : "N/A",
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
