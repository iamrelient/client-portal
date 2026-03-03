import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Presentation | Ray Renders",
  robots: { index: false, follow: false },
};

export default function PresentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        rel="preload"
        as="style"
        href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400&family=Inter:wght@300;400&display=swap"
      />
      {children}
    </>
  );
}
