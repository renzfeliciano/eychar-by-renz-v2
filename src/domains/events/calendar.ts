import { addDays, dateToDateKey, weekdayOf } from "@/lib/date-key";

export type CalendarCell = { date: string; day: number; inMonth: boolean; isWeekend: boolean };

/** "YYYY-MM" moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  return `${Math.floor(total / 12)}-${String((((total % 12) + 12) % 12) + 1).padStart(2, "0")}`;
}

/**
 * A month as whole weeks, Sunday first: the leading and trailing days of the
 * neighbouring months fill the first and last week (marked `inMonth: false`),
 * so the grid never has blank cells.
 */
export function buildMonthGrid(month: string): CalendarCell[] {
  const first = `${month}-01`;
  const last = dateToDateKey(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
  const start = addDays(first, -weekdayOf(first));
  const end = addDays(last, 6 - weekdayOf(last));

  const cells: CalendarCell[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    cells.push({ date, day: Number(date.slice(8, 10)), inMonth: date.startsWith(month), isWeekend: weekday === 0 || weekday === 6 });
  }
  return cells;
}

/** Items grouped by `date` (YYYY-MM-DD) in date order; within a day, timed items by time, untimed last. */
export function groupByDate<T extends { date: string; time?: string | null }>(items: T[]): { date: string; items: T[] }[] {
  const byDate = new Map<string, T[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: [...dayItems].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")) }));
}
