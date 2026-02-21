import { prisma } from "@/lib/prisma";
import { Metadata } from "next";

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
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
                url: `${baseUrl}/api/projects/${params.id}/thumbnail`,
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
