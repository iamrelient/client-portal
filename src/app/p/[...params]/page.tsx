import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: { params: string[] };
}

async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      company: true,
      thumbnailPath: true,
    },
  });
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    concept: "Concept",
    in_progress: "In Progress",
    review: "Review",
    revisions: "Revisions",
    complete: "Complete",
  };
  return labels[status] || status;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const projectId = params.params[0];
  const project = await getProject(projectId);

  if (!project) {
    return { title: "Project Not Found" };
  }

  const title = project.name;
  const description = [
    project.company && `Client: ${project.company}`,
    `Status: ${getStatusLabel(project.status)}`,
    "View project files and status updates",
  ]
    .filter(Boolean)
    .join(" · ");

  const baseUrl = process.env.NEXTAUTH_URL || "https://portal-rayrenders.vercel.app";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(project.thumbnailPath
        ? {
            images: [
              {
                url: `${baseUrl}/api/og/${project.id}`,
                width: 1200,
                height: 630,
                alt: project.name,
              },
            ],
          }
        : {}),
    },
  };
}

export default async function PublicSharePage({ params }: Props) {
  const projectId = params.params[0];
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const dashboardUrl = `/dashboard/projects/${project.id}`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0c0e1a] px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl">
        {project.thumbnailPath && (
          <div className="aspect-video w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og/${project.id}`}
              alt={project.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="p-6">
          <h1 className="text-xl font-bold text-white">{project.name}</h1>
          {project.company && (
            <p className="mt-1 text-sm text-slate-400">{project.company}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-400">
              {getStatusLabel(project.status)}
            </span>
          </div>
          <Link
            href={dashboardUrl}
            className="mt-6 block w-full rounded-lg bg-brand-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            View in Portal
          </Link>
          <p className="mt-4 text-center text-xs text-slate-500">
            Ray Renders Client Portal
          </p>
        </div>
      </div>
    </div>
  );
}
