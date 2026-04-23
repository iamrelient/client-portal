interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  logo?: string;
}

export function PageHeader({ title, description, action, logo }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {action}
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className="max-h-32 max-w-[280px] flex-shrink-0 object-contain"
          />
        )}
      </div>
    </div>
  );
}
