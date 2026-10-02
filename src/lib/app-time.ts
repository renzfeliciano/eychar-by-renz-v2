/**
 * The organization's wall clock. Times are stored as UTC instants; every
 * "what time was it there" reading (roster times, today's date, late or
 * on time, greetings) goes through here so it doesn't depend on the
 * server's own timezone: Vercel runs in UTC, 8 hours behind Manila.
 * One setting, defaulting to the Philippines.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() || "Asia/Manila";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date) {
  const values: Record<string, string> = {};
  for (const part of PARTS.formatToParts(date)) values[part.type] = part.value;
  return { year: values.year, month: values.month, day: values.day, hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}

/** "12:27" for an instant, in the organization's time zone. */
export function clockTime(value: Date | string): string {
  const { hour, minute } = parts(new Date(value));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function minutesOfDayInAppZone(value: Date | string): number {
  const { hour, minute } = parts(new Date(value));
  return hour * 60 + minute;
}

export function hourInAppZone(value: Date | string = new Date()): number {
  return parts(new Date(value)).hour;
}

/** Today's (or an instant's) calendar day there, as "YYYY-MM-DD". */
export function appDateKey(value: Date | string = new Date()): string {
  const { year, month, day } = parts(new Date(value));
  return `${year}-${month}-${day}`;
}

/** The instant for a date ("2026-10-01") and wall-clock time ("08:00") there. */
export function zonedInstant(dateKey: string, time: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset at that moment: how far its wall clock is from UTC.
  const seen = parts(new Date(asIfUtc));
  const seenAsUtc = Date.UTC(Number(seen.year), Number(seen.month) - 1, Number(seen.day), seen.hour, seen.minute);
  return new Date(asIfUtc - (seenAsUtc - asIfUtc));
}

/**
 * Display presets for instants (createdAt, audit timestamps, sign-ins).
 * Every one is rendered on the organization's wall clock, never the
 * server's: a Vercel function runs in UTC and would print Manila's 9 AM
 * as 1 AM. Calendar dates stored as UTC midnight (hire dates, periods,
 * last working days) are not instants: format those with
 * `formatCalendarDate` from `@/lib/date-key`.
 */
export const DATE_TIME_STYLES = {
  /** "Oct 2, 2026, 3:04 PM" */
  medium: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
  /** "Oct 2, 2026, 3:04:05 PM" */
  seconds: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" },
  /** "Oct 2, 3:04 PM" */
  short: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  /** "October 2, 2026 at 3:04 PM" */
  long: { dateStyle: "long", timeStyle: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateTimeStyle = keyof typeof DATE_TIME_STYLES;

/** An instant as date and time in the organization's time zone. */
export function formatDateTime(value: Date | string | number, style: DateTimeStyle | Intl.DateTimeFormatOptions = "medium"): string {
  const options = typeof style === "string" ? DATE_TIME_STYLES[style] : style;
  return new Date(value).toLocaleString("en-US", { ...options, timeZone: APP_TIME_ZONE });
}

/** The calendar day an instant fell on there: "Oct 2, 2026". */
export function formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  return new Date(value).toLocaleDateString("en-US", { ...options, timeZone: APP_TIME_ZONE });
}

/** An instant's wall-clock time there: "3:04 PM". */
export function formatTime(value: Date | string | number, options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }): string {
  return new Date(value).toLocaleTimeString("en-US", { ...options, timeZone: APP_TIME_ZONE });
}
