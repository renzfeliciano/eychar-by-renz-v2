import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export type ColoredBucket = { label: string; count: number; color: string };

/** A ranked list of labelled bars with count and share, for small breakdowns (dashboard, cases). */
export function HorizontalBarChart({
  buckets,
  ariaLabel,
  emptyTitle,
  emptyDescription,
  labelClassName = "w-28",
}: {
  buckets: ColoredBucket[];
  ariaLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Width of the label column; widen it for long names such as projects. */
  labelClassName?: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const max = Math.max(...buckets.map((bucket) => bucket.count));

  return (
    <div className="flex flex-col gap-3" role="img" aria-label={ariaLabel}>
      {buckets.map((bucket) => {
        const widthPct = max === 0 ? 0 : Math.round((bucket.count / max) * 100);
        const sharePct = total === 0 ? 0 : Math.round((bucket.count / total) * 100);
        return (
          <div key={bucket.label} className="flex items-center gap-3 text-sm">
            <span className={cn("flex shrink-0 items-center gap-1.5 truncate", labelClassName)} title={bucket.label}>
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: bucket.color }}
              />
              <span className="truncate text-muted-foreground">{bucket.label}</span>
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: bucket.color }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-medium tabular-nums">
              {bucket.count} <span className="text-xs font-normal text-muted-foreground">({sharePct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
