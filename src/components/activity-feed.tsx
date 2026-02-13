import { Activity, FileText, FolderMinus, FolderOpen, FolderPlus, LogIn, UserPlus, Settings } from "lucide-react";
import { formatRelativeDate } from "@/lib/format-date";

const iconMap: Record<string, typeof Activity> = {
  ACCOUNT_CREATED: UserPlus,
  LOGIN: LogIn,
  SETTINGS_UPDATED: Settings,
  DOCUMENT_UPLOADED: FileText,
  FILE_UPLOADED: FileText,
  FILE_DELETED: FileText,
  PROJECT_CREATED: FolderPlus,
  PROJECT_DELETED: FolderMinus,
  PROJECT_UPDATED: FolderOpen,
};

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user?: { name: string; email: string };
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  showUser?: boolean;
}

export function ActivityFeed({ activities, showUser }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No recent activity
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-4">
        {activities.map((activity, idx) => {
          const Icon = iconMap[activity.type] || Activity;
          const isLast = idx === activities.length - 1;

          return (
            <li key={activity.id} className="relative pb-4">
              {!isLast && (
                <span
                  className="absolute left-5 top-10 -ml-px h-full w-0.5 bg-slate-200"
                  aria-hidden="true"
                />
              )}
              <div className="relative flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Icon className="h-5 w-5 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">
                    {activity.description}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <time>{formatRelativeDate(activity.createdAt)}</time>
                    {showUser && activity.user && (
                      <>
                        <span>&middot;</span>
                        <span>{activity.user.name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
