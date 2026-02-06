import { Sidebar } from "@/components/sidebar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="lg:ml-64">
        <div className="px-4 py-8 sm:px-6 lg:px-8 pt-16 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
