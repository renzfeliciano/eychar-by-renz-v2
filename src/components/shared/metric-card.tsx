import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "warning" | "danger" | "success";

const VALUE_TONE: Record<Tone, string> = {
  default: "",
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
  success: "text-success",
};

/**
 * One headline number with its label, for the summary at the top of a
 * workspace. Set like a ledger total: the label in small type, the figure
 * large and tabular, a short hint underneath in words (never color alone).
 * `tone` marks the figure's meaning: primary for the one number the page is
 * about, warning/danger for something that needs attention. With `href` the
 * whole cell is one link to the screen behind the number.
 *
 * Put several in a MetricStrip: they share one ruled frame instead of each
 * floating as its own card. On its own a MetricCard draws its own frame.
 * There's no icon: a tinted icon tile beside every number is decoration.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  emphasis = false,
  className,
  testId,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  /** Shorthand for tone="primary". */
  emphasis?: boolean;
  className?: string;
  testId?: string;
  href?: string;
}) {
  const resolved: Tone = emphasis && tone === "default" ? "primary" : tone;
  const cardClass = cn(
    "flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-4 py-3.5",
    // Inside a strip the strip draws the frame and the rules between cells.
    "in-data-[slot=metric-strip]:rounded-none in-data-[slot=metric-strip]:border-t-0 in-data-[slot=metric-strip]:border-l-0",
    href && "transition-colors duration-150 hover:bg-accent/50 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
    className,
  );
  const body = (
    <>
      <span className="truncate text-[13px] text-muted-foreground" title={label}>
        {label}
      </span>
      <span className={cn("truncate text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums", VALUE_TONE[resolved])}>{value}</span>
      {/* Up to two lines: a hint is a short sentence, and cutting it mid-word hides its point. */}
      {hint && <span className="line-clamp-2 text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cardClass} data-testid={testId}>
        {body}
      </Link>
    );
  }
  return (
    <div className={cardClass} data-testid={testId}>
      {body}
    </div>
  );
}

const STRIP_COLUMNS: Record<2 | 3 | 4 | 5, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

/**
 * A row of MetricCards in one ruled frame with hairlines between the cells,
 * like the totals line of a ledger page. Each cell draws its right and
 * bottom rule; the inner grid tucks the outermost ones under the frame.
 */
export function MetricStrip({ columns = 4, className, children, testId }: { columns?: 2 | 3 | 4 | 5; className?: string; children: React.ReactNode; testId?: string }) {
  return (
    <div data-slot="metric-strip" data-testid={testId} className={cn("overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-soft)]", className)}>
      <div className={cn("-mr-px -mb-px grid", STRIP_COLUMNS[columns])}>{children}</div>
    </div>
  );
}
