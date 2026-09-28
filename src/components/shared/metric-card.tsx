import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "warning" | "danger" | "success";

const VALUE_TONE: Record<Tone, string> = {
  default: "",
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-destructive",
  success: "text-success",
};

const ICON_TONE: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
};

/**
 * One headline number with its label, for the summary strip at the top of
 * a workspace. Numbers are tabular so a row of cards lines up; the hint
 * carries context in words, never color alone. `tone` marks the figure's
 * meaning: primary for the one number the page is about, warning/danger
 * for something that needs attention. With `href` the whole card is one link
 * to the screen behind the number (the dashboard uses this).
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  emphasis = false,
  className,
  testId,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Shorthand for tone="primary". */
  emphasis?: boolean;
  className?: string;
  testId?: string;
  href?: string;
}) {
  const resolved: Tone = emphasis && tone === "default" ? "primary" : tone;
  const cardClass = cn(
    "flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]",
    href && "transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-[var(--shadow-raised)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
    className,
  );
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase" title={label}>
          {label}
        </span>
        <span className={cn("truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", VALUE_TONE[resolved])}>{value}</span>
        {/* Up to two lines: a hint is a short sentence, and cutting it mid-word hides its point. */}
        {hint && <span className="line-clamp-2 text-xs text-muted-foreground">{hint}</span>}
      </div>
      {Icon && (
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE[resolved])} aria-hidden="true">
          <Icon className="size-4" />
        </span>
      )}
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
