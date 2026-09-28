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
    // The title block keeps a sensible minimum width; when the actions don't
    // fit beside it they wrap below instead of squeezing the title.
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3" data-testid={testId}>
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
