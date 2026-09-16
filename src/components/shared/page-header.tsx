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
    <header className="flex flex-wrap items-start justify-between gap-4" data-testid={testId}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
