"use client";

import { useState } from "react";
import type { SelectOption } from "@/components/shared/option-select";
import { EventDayDialog, type EventItem } from "./event-day-dialog";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_PER_DAY = 3;

type EventWithDate = EventItem & { date: string };
type CalendarCell = { key: string; pad: true } | { key: string; pad: false; date: string; day: number };

function buildCalendarCells(month: string): CalendarCell[] {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const startWeekday = new Date(Date.UTC(year, monthNum - 1, 1)).getUTCDay();
  const cells: CalendarCell[] = Array.from({ length: startWeekday }, (_, weekday) => ({ key: `pad-${month}-${weekday}`, pad: true }));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({ key: date, pad: false, date, day });
  }
  return cells;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const CATEGORY_TONES = [
  "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
];

export function EventsCalendar({
  organizationId,
  month,
  events,
  categories,
  categoryNameByCode,
  canManage,
}: {
  organizationId: string;
  month: string;
  events: EventWithDate[];
  categories: SelectOption[];
  categoryNameByCode: Map<string, string>;
  canManage: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const toneByCategory = new Map(categories.map((category, index) => [category.id, CATEGORY_TONES[index % CATEGORY_TONES.length]]));
  const eventsByDate = new Map<string, EventWithDate[]>();
  for (const event of events) {
    const existing = eventsByDate.get(event.date);
    if (existing) existing.push(event);
    else eventsByDate.set(event.date, [event]);
  }

  const cells = buildCalendarCells(month);
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  return (
    <>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="bg-muted p-2 text-center text-xs font-semibold text-muted-foreground">
            {weekday}
          </div>
        ))}
        {cells.map((cell) => {
          if (cell.pad) return <div key={cell.key} className="bg-card" />;
          const dayEvents = eventsByDate.get(cell.date) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const hiddenCount = dayEvents.length - visible.length;
          const isToday = cell.date === todayIso();
          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => setSelectedDate(cell.date)}
              className="flex min-h-24 flex-col gap-1 bg-card p-1.5 text-left transition-colors hover:bg-accent/40"
              aria-label={`${cell.date}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
              data-testid={`calendar-day-${cell.date}`}
            >
              <span className={`w-fit rounded px-1.5 text-xs font-medium ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {cell.day}
              </span>
              {visible.map((event) => (
                <span
                  key={event.id}
                  title={`${event.time ? `${event.time} ` : ""}${event.title}`}
                  className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${toneByCategory.get(event.category) ?? "bg-muted text-muted-foreground"}`}
                >
                  {event.time ? `${event.time} ` : ""}
                  {event.title}
                </span>
              ))}
              {hiddenCount > 0 && <span className="text-[11px] text-muted-foreground">+{hiddenCount} more</span>}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <EventDayDialog
          organizationId={organizationId}
          date={selectedDate}
          events={selectedEvents}
          categories={categories}
          categoryNameByCode={categoryNameByCode}
          canManage={canManage}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}
