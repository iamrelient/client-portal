import { prisma } from "@/lib/prisma";
import { Metadata } from "next";

interface Props {
  params: { params: string[] };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const projectId = params.params[0];
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, company: true, thumbnailPath: true, status: true },
  });

  if (!project) {
    return { title: "Project Not Found" };
  }

  const title = project.name;
  const description = [
    project.company && `Client: ${project.company}`,
    `Status: ${project.status?.replace("_", " ") || "In Progress"}`,
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
                url: `${baseUrl}/api/projects/${projectId}/thumbnail`,
                width: 1200,
                height: 400,
                alt: project.name,
              },
            ],
          }
        : {}),
    },
  };
}

export default function ProjectLayout({ children }: Props) {
  return children;
}
