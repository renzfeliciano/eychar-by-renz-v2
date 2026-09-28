import { cn } from "@/lib/utils";

/** "1.5" for halves, whole numbers without decimals: leave is mostly counted in half days. */
export function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(value * 10 === Math.round(value * 10) ? 1 : 2);
}

/**
 * Used (solid) and pending (lighter) as parts of the total, so "how much is
 * left" reads at a glance. Labelled in words for screen readers; the
 * numbers beside it carry the same information, so color is never alone.
 */
export function UsageBar({ used, pending, total, className }: { used: number; pending: number; total: number; className?: string }) {
  const safeTotal = Math.max(total, used + pending, 0.0001);
  const usedPercent = Math.min(100, (used / safeTotal) * 100);
  const pendingPercent = Math.min(100 - usedPercent, (pending / safeTotal) * 100);
  const overdrawn = used > total;
  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={`${formatDays(used)} of ${formatDays(total)} days used${pending ? `, ${formatDays(pending)} pending` : ""}`}
    >
      <span className={cn("h-full", overdrawn ? "bg-destructive" : "bg-primary")} style={{ width: `${usedPercent}%` }} />
      <span className="h-full bg-primary/35" style={{ width: `${pendingPercent}%` }} />
    </div>
  );
}
