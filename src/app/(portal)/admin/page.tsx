"use client";

import { useEffect, useState } from "react";
import { Users, UserCheck, UserX, Activity } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ActivityFeed } from "@/components/activity-feed";
import { PageHeader } from "@/components/page-header";
import { StatCardSkeleton, ActivityFeedSkeleton } from "@/components/skeleton";

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
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 h-6 w-48 animate-pulse rounded bg-slate-200" />
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

      <div className="mt-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Recent Platform Activity
          </h2>
          <ActivityFeed
            activities={data?.recentActivities ?? []}
            showUser
          />
        </div>
      </div>
    </div>
  );
}
