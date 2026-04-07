interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  logo?: string;
}

export function PageHeader({ title, description, action, logo }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {logo && (
          <img
            src={logo}
            alt=""
            className="h-10 w-10 rounded-lg border border-white/[0.08] bg-white/[0.05] object-contain p-1"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
