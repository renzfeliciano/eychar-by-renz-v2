import type { HolidayView } from "./holiday-types";

export type DayEvent = { id: string; title: string; time: string | null; category: string };

/** Everything worth knowing about one calendar day, beyond who works it. */
export type DayInfo = { holidays: HolidayView[]; events: DayEvent[]; note: string | null };

/** Groups a month's holidays, company events and HR notes by day; days with nothing are left out. */
export function buildDayInfo(holidays: HolidayView[], events: (DayEvent & { date: string })[], notes: Record<string, string>): Record<string, DayInfo> {
  const byDay: Record<string, DayInfo> = {};
  const day = (date: string) => (byDay[date] ??= { holidays: [], events: [], note: null });
  for (const holiday of holidays) day(holiday.date).holidays.push(holiday);
  for (const { date, ...event } of events) day(date).events.push(event);
  for (const [date, note] of Object.entries(notes)) if (note) day(date).note = note;
  for (const info of Object.values(byDay)) info.events.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  return byDay;
}
