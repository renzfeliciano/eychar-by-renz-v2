export function PageHeader({
  title,
  description,
  action,
  testId,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <header className="flex flex-col gap-4 min-[421px]:flex-row min-[421px]:items-start min-[421px]:justify-between" data-testid={testId}>
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="bg-gradient-brand mt-1 h-6 w-1 shrink-0 rounded-full" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
