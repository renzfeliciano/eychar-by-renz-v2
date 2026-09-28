/**
 * Calendar days as "YYYY-MM-DD" keys, stored as UTC midnight of that day:
 * the form attendance records, schedule entries and payroll periods all use.
 */
export function dateKeyToDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function dateToDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's key from the server's local calendar (the organization's own
 * timezone in this deployment), not the UTC date, which in UTC+8 is still
 * "yesterday" until 8am.
 */
export function localDateKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(key: string, days: number): string {
  return dateToDateKey(new Date(dateKeyToDate(key).getTime() + days * 86_400_000));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return dateKeyToDate(key).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every day from `from` to `to`, both included. */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) keys.push(key);
  return keys;
}

export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  return dateKeyToDate(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** "Sep 26 – Oct 10, 2026", "Oct 11–25, 2026". */
export function formatDateRange(from: string, to: string): string {
  const [fromYear, fromMonth] = from.split("-");
  const [toYear, toMonth] = to.split("-");
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${formatDateKey(from, { month: "short", day: "numeric" })}–${Number(to.slice(8))}, ${toYear}`;
  }
  if (fromYear === toYear) return `${formatDateKey(from, { month: "short", day: "numeric" })} – ${formatDateKey(to)}`;
  return `${formatDateKey(from)} – ${formatDateKey(to)}`;
}
