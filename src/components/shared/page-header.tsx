/**
 * The top of every workspace page, set like the head of a ledger page: the
 * title, one line on what the page is for, the page's own actions on the
 * right, and a hairline rule closing the block off from the work below.
 */
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
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-5" data-testid={testId}>
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-[-0.018em] text-balance">{title}</h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
