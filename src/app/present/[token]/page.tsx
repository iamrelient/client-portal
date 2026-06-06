import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import PresentClient from "./present-client";

/**
 * Server wrapper for the presentation viewer. Its only job beyond
 * rendering the (client) viewer is to emit Open Graph / Twitter
 * metadata so that when the share link is pasted into iMessage, Slack,
 * WhatsApp, email, etc. it unfurls into a rich card — presentation name
 * + a hero thumbnail — instead of a bare URL.
 *
 * The viewer UI itself stays a client component (present-client.tsx);
 * a client component can't export generateMetadata, hence this split.
 */

const BASE_URL =
  process.env.NEXTAUTH_URL || "https://portal-rayrenders.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const presentation = await prisma.presentation.findUnique({
    where: { accessToken: params.token },
    select: {
      title: true,
      subtitle: true,
      isActive: true,
      tourHeroFileId: true,
      project: { select: { name: true, company: true } },
      sections: {
        orderBy: { order: "asc" },
        select: { type: true, fileId: true },
      },
    },
  });

  // Unknown / revoked link — give a neutral card, no detail leak.
  if (!presentation || !presentation.isActive) {
    return {
      title: "Presentation | Ray Renders",
      robots: { index: false, follow: false },
    };
  }

  const title =
    presentation.title?.trim() ||
    presentation.project?.name ||
    "Virtual Tour";

  const description =
    presentation.subtitle?.trim() ||
    [presentation.project?.company, "An interactive 360° tour by Ray Renders"]
      .filter(Boolean)
      .join(" · ");

  // Pick a hero thumbnail: the explicit tour cover first, otherwise the
  // first hero/image/panorama section that has a backing file.
  const heroFileId =
    presentation.tourHeroFileId ||
    presentation.sections.find(
      (s) =>
        (s.type === "hero" || s.type === "image" || s.type === "panorama") &&
        s.fileId
    )?.fileId ||
    null;

  const images = heroFileId
    ? [
        {
          url: `${BASE_URL}/api/present/${params.token}/asset/${heroFileId}`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ]
    : [];

  return {
    title,
    description,
    // Keep it out of search engines (it's a private share link) but the
    // OG/Twitter tags below still drive link unfurls in chat apps.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "Ray Renders",
      type: "website",
      url: `${BASE_URL}/present/${params.token}`,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default function PresentPage() {
  return <PresentClient />;
}
