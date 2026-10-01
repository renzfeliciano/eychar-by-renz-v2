"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { SelectOption } from "@/components/shared/option-select";
import { buildMonthGrid, groupByDate, shiftMonth } from "@/domains/events/calendar";
import { addDays, formatDateKey } from "@/lib/date-key";
import { cn } from "@/lib/utils";
import { EventDayDialog, type EventItem } from "./event-day-dialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;
// Category identity, in a fixed order (never recycled by rank): the chart palette's categorical series.
const CATEGORY_COLORS = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)", "var(--viz-series-4)", "var(--viz-series-5)"];

type EventWithDate = EventItem & { date: string };
type DialogState = { date: string; mode: "list" | "create" } | null;

export function EventsCalendar({
  organizationId,
  month,
  todayKey,
  events,
  categories,
  categoryNameByCode,
  canManage,
}: {
  organizationId: string;
  month: string;
  /** The organization's today (YYYY-MM-DD), from the server so both renders agree. */
  todayKey: string;
  events: EventWithDate[];
  categories: SelectOption[];
  categoryNameByCode: Map<string, string>;
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const colorByCategory = new Map(categories.map((category, index) => [category.id, CATEGORY_COLORS[index % CATEGORY_COLORS.length]]));
  const colorOf = (code: string) => colorByCategory.get(code) ?? "var(--viz-ink-muted)";
  const eventsByDate = new Map(groupByDate(events).map((group) => [group.date, group.items]));
  const cells = buildMonthGrid(month);
  const monthLabel = formatDateKey(`${month}-01`, { month: "long", year: "numeric" });
  const isCurrentMonth = todayKey.startsWith(month);

  const upcoming = groupByDate(events.filter((event) => event.date >= todayKey));
  const countByCategory = new Map<string, number>();
  for (const event of events) countByCategory.set(event.category, (countByCategory.get(event.category) ?? 0) + 1);

  const dayLabel = (date: string) => {
    if (date === todayKey) return "Today";
    if (date === addDays(todayKey, 1)) return "Tomorrow";
    return formatDateKey(date, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 sm:px-4">
            <Link
              href="/events"
              aria-disabled={isCurrentMonth}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), isCurrentMonth && "pointer-events-none opacity-50")}
            >
              Today
            </Link>
            <div className="flex items-center">
              <Link href={`/events?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={`/events?month=${shiftMonth(month, 1)}`} aria-label="Next month" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <h2 className="text-base font-semibold tracking-tight">{monthLabel}</h2>
            {canManage && (
              <Button type="button" size="sm" className="ml-auto" onClick={() => setDialog({ date: isCurrentMonth ? todayKey : `${month}-01`, mode: "create" })}>
                <CalendarPlus className="size-3.5" aria-hidden="true" />
                New event
              </Button>
            )}
          </div>

          <div className="grid grid-cols-7 border-b bg-muted/40">
            {WEEKDAYS.map((weekday, index) => (
              <div key={weekday} className={cn("px-2 py-2 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:text-left", (index === 0 || index === 6) && "text-muted-foreground/70")}>
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell, index) => {
              const dayEvents = eventsByDate.get(cell.date) ?? [];
              const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
              const hiddenCount = dayEvents.length - visible.length;
              const isToday = cell.date === todayKey;
              const fullDate = formatDateKey(cell.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
              return (
                <button
                  type="button"
                  key={cell.date}
                  onClick={() => setDialog({ date: cell.date, mode: "list" })}
                  aria-label={`${fullDate}${isToday ? ", today" : ""}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "group flex min-h-16 min-w-0 flex-col gap-1 border-b p-1 text-left transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-28 sm:p-1.5",
                    index % 7 !== 6 && "border-r",
                    index >= cells.length - 7 && "border-b-0",
                    cell.isWeekend && "bg-muted/25",
                    !cell.inMonth && "bg-muted/40",
                  )}
                  data-testid={`calendar-day-${cell.date}`}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                      isToday ? "bg-primary text-primary-foreground" : cell.inMonth ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    {cell.day}
                  </span>
                  {/* Phones: a dot per event. Wider: the events themselves. */}
                  {dayEvents.length > 0 && (
                    <span className="flex flex-wrap gap-0.5 px-1 sm:hidden" aria-hidden="true">
                      {dayEvents.slice(0, 4).map((event) => (
                        <span key={event.id} className="size-1.5 rounded-full" style={{ backgroundColor: colorOf(event.category) }} />
                      ))}
                    </span>
                  )}
                  <span className="hidden w-full min-w-0 flex-col gap-0.5 sm:flex">
                    {visible.map((event) => (
                      <span
                        key={event.id}
                        title={`${event.time ? `${event.time} ` : ""}${event.title}`}
                        className={cn("flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md bg-muted/60 px-1 py-0.5 text-[11px] leading-4 lg:gap-1.5 lg:px-1.5", !cell.inMonth && "opacity-60")}
                      >
                        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(event.category) }} aria-hidden="true" />
                        {/* Narrow (tablet) cells keep the title; the time shows once there's room for both. */}
                        {event.time && <span className="hidden shrink-0 text-muted-foreground tabular-nums xl:inline">{event.time}</span>}
                        <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                      </span>
                    ))}
                    {hiddenCount > 0 && <span className="px-1.5 text-[11px] font-medium text-muted-foreground">+{hiddenCount} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section aria-label="Coming up" className="rounded-xl border bg-card shadow-[var(--shadow-soft)]">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Coming up</h2>
              <p className="text-xs text-muted-foreground">{monthLabel}, from today</p>
            </div>
            <div className="flex max-h-[26rem] flex-col gap-4 overflow-y-auto p-4">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">{todayKey > `${month}-31` ? "This month is over." : "Nothing else scheduled this month."}</p>
              ) : (
                upcoming.map((group) => (
                  <div key={group.date} className="flex flex-col gap-1.5">
                    <h3 className={cn("text-xs font-semibold", group.date === todayKey ? "text-primary" : "text-muted-foreground")}>{dayLabel(group.date)}</h3>
                    <ul className="flex flex-col gap-1">
                      {group.items.map((event) => (
                        <li key={event.id}>
                          <button
                            type="button"
                            onClick={() => setDialog({ date: event.date, mode: "list" })}
                            className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                          >
                            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(event.category) }} aria-hidden="true" />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-medium">{event.title}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {event.time ?? "All day"} · {categoryNameByCode.get(event.category) ?? event.category}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>

          {categories.length > 0 && (
            <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
              <h2 className="mb-2.5 text-sm font-semibold">Categories</h2>
              <ul aria-label="Categories" className="flex flex-col gap-1.5">
                {categories.map((category) => (
                  <li key={category.id} className="flex items-center gap-2.5 text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(category.id) }} aria-hidden="true" />
                    <span className="flex-1 truncate">{category.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{countByCategory.get(category.id) ?? 0}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {dialog && (
        <EventDayDialog
          key={`${dialog.date}-${dialog.mode}`}
          organizationId={organizationId}
          date={dialog.date}
          initialMode={dialog.mode}
          events={eventsByDate.get(dialog.date) ?? []}
          categories={categories}
          categoryNameByCode={categoryNameByCode}
          canManage={canManage}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
