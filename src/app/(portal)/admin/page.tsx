"use client";

import { useEffect, useState } from "react";
import { Users, UserCheck, UserX, Activity, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";
import { StatCardSkeleton, ActivityFeedSkeleton } from "@/components/skeleton";

interface InactiveClient {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  company: string | null;
}

interface AnalyticsData {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  recentActivities: {
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name: string; email: string };
  }[];
  inactiveClients: InactiveClient[];
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Admin Overview"
          description="Platform analytics and recent activity across all users."
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-8">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="mb-4 h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
            <ActivityFeedSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Admin Overview"
        description="Platform analytics and recent activity across all users."
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={data?.totalUsers ?? 0}
          icon={Users}
        />
        <StatCard
          title="Active Users"
          value={data?.activeUsers ?? 0}
          icon={UserCheck}
        />
        <StatCard
          title="Inactive Users"
          value={data?.inactiveUsers ?? 0}
          icon={UserX}
        />
        <StatCard
          title="Total Activities"
          value={
            data?.recentActivities?.length
              ? `${data.recentActivities.length}+`
              : "0"
          }
          icon={Activity}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-semibold text-slate-100">
            Recent Platform Activity
          </h2>
          <ActivityFeed
            activities={data?.recentActivities ?? []}
            showUser
          />
        </div>

        {data?.inactiveClients && data.inactiveClients.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-white/[0.03] p-6 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-slate-100">
                Clients Needing Attention
              </h2>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              These clients haven&apos;t logged in for 30+ days.
            </p>
            <div className="space-y-2">
              {data.inactiveClients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-4 py-3 border border-white/[0.06]"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.email}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {client.lastLoginAt
                      ? `Last login: ${new Date(client.lastLoginAt).toLocaleDateString()}`
                      : "Never logged in"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
