import { EmptyState } from "@/components/shared/empty-state";
import type { ColoredBucket } from "./dashboard-types";

export function ColumnBarChart({
  buckets,
  ariaLabel,
  emptyTitle,
  emptyDescription,
}: {
  buckets: ColoredBucket[];
  ariaLabel: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="flex h-40 items-end gap-3" role="img" aria-label={ariaLabel}>
      {buckets.map((bucket) => {
        const heightPct = Math.round((bucket.count / max) * 100);
        return (
          <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums">{bucket.count}</span>
            <div className="flex h-24 w-full items-end rounded-md bg-muted">
              <div
                className="w-full rounded-md transition-[height] duration-500"
                style={{ height: `${Math.max(heightPct, bucket.count > 0 ? 6 : 0)}%`, backgroundColor: bucket.color }}
              />
            </div>
            <span className="text-center text-xs text-muted-foreground">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}
