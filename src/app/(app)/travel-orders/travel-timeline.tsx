import type { CSSProperties } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { timelineBars } from "@/domains/travel-orders/travel-timing";
import { addDays, dateToDateKey, formatDateKey, weekdayOf } from "@/lib/date-key";
import { cn } from "@/lib/utils";

const DAYS = 14;
const MAX_ROWS = 8;
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

type TimelineOrder = { id: string; names: string[]; startDate: Date; endDate: Date; status: string; remarks?: string | null };

/**
 * The next two weeks as columns, one bar per trip: who is away, and when,
 * at a glance. Trips that began earlier or run past the window show a
 * squared-off edge on that side.
 */
export function TravelTimeline({ orders, todayKey }: { orders: TimelineOrder[]; todayKey: string }) {
  const days = Array.from({ length: DAYS }, (_, index) => addDays(todayKey, index));
  const byId = new Map(orders.map((order) => [order.id, order]));
  const bars = timelineBars(orders, todayKey, DAYS);
  const shown = bars.slice(0, MAX_ROWS);
  const grid = { gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` } as CSSProperties;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next two weeks</CardTitle>
        <CardDescription>
          {formatDateKey(days[0], { month: "short", day: "numeric" })} – {formatDateKey(days[DAYS - 1], { month: "short", day: "numeric" })} ·{" "}
          {bars.length === 1 ? "1 trip" : `${bars.length} trips`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bars.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No one is scheduled to travel in the next two weeks.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[40rem]">
              <div className="grid border-b pb-1.5" style={grid}>
                {days.map((key, index) => {
                  const weekday = weekdayOf(key);
                  return (
                    <div key={key} className={cn("flex flex-col items-center gap-0.5 text-[11px] leading-none", weekday === 0 || weekday === 6 ? "text-muted-foreground/60" : "text-muted-foreground")}>
                      <span>{index === 0 ? "Today" : WEEKDAY_INITIALS[weekday]}</span>
                      <span className={cn("flex size-5 items-center justify-center rounded-full font-medium tabular-nums", index === 0 && "bg-primary text-primary-foreground")}>
                        {Number(key.slice(8, 10))}
                      </span>
                    </div>
                  );
                })}
              </div>
              <ul className="relative flex flex-col gap-1.5 pt-2">
                {/* Weekend and today column shading behind the bars. */}
                <li aria-hidden="true" className="pointer-events-none absolute inset-0 grid" style={grid}>
                  {days.map((key, index) => (
                    <span key={key} className={cn(index === 0 && "bg-primary/5", index > 0 && (weekdayOf(key) === 0 || weekdayOf(key) === 6) && "bg-muted/50")} />
                  ))}
                </li>
                {shown.map((bar) => {
                  const order = byId.get(bar.id)!;
                  const label = order.names.join(", ");
                  const range = `${formatDateKey(dateToDateKey(order.startDate), { month: "short", day: "numeric" })} – ${formatDateKey(dateToDateKey(order.endDate), { month: "short", day: "numeric" })}`;
                  return (
                    <li key={bar.id} className="relative grid" style={grid}>
                      <div
                        role="img"
                        aria-label={`${label}: ${range}${order.remarks ? `, ${order.remarks}` : ""}`}
                        title={`${label}\n${range}${order.remarks ? `\n${order.remarks}` : ""}`}
                        className={cn(
                          "flex h-7 min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-primary/12 px-2 text-xs font-medium text-primary ring-1 ring-primary/25 ring-inset",
                          bar.continuesBefore && "rounded-l-none",
                          bar.continuesAfter && "rounded-r-none",
                        )}
                        style={{ gridColumn: `${bar.start + 1} / span ${bar.span}` }}
                      >
                        <span className="truncate">{label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {bars.length > shown.length && <p className="pt-2 text-xs text-muted-foreground">+{bars.length - shown.length} more trips in this window, listed below.</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
