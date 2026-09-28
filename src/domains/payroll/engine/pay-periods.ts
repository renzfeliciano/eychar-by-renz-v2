import { addDays, daysInMonth, weekdayOf } from "@/lib/date-key";
import type { PayFrequency } from "./pay-frequency";

/**
 * A payroll calendar's cutoff rule:
 * - semi-monthly: `cutoffDay` (1–15) ends the first cutoff; the second ends
 *   15 days later, or at month end when the first ends on the 15th
 *   (10 → 26–10 and 11–25; 15 → 1–15 and 16–end).
 * - monthly: `cutoffDay` (1–31) ends the period, clamped to the month's last day.
 * - weekly: `cutoffDay` is the weekday the week ends on (0 = Sunday … 6 = Saturday).
 * Pay day is `payDateOffsetDays` after the cutoff.
 */
export type CutoffSpec = { payFrequency: PayFrequency; cutoffDay: number; payDateOffsetDays: number };

export type PayPeriod = { start: string; end: string; payDate: string };

const key = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const index = year * 12 + (month - 1) + delta;
  return [Math.floor(index / 12), (index % 12) + 1];
}

/** The cutoff end dates in a month, ascending. */
function cutoffEndsInMonth(spec: CutoffSpec, year: number, month: number): string[] {
  const last = daysInMonth(year, month);
  if (spec.payFrequency === "monthly") return [key(year, month, Math.min(spec.cutoffDay, last))];
  const first = Math.min(spec.cutoffDay, last);
  const second = spec.cutoffDay >= 15 ? last : Math.min(spec.cutoffDay + 15, last);
  return [key(year, month, first), key(year, month, second)];
}

/** Cutoff ends from the month before `date`'s through the month after, ascending. */
function nearbyCutoffEnds(spec: CutoffSpec, date: string): string[] {
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  return [-1, 0, 1].flatMap((delta) => cutoffEndsInMonth(spec, ...shiftMonth(year, month, delta)));
}

/** The latest cutoff end on or before `date`. */
function latestEndOnOrBefore(spec: CutoffSpec, date: string): string {
  if (spec.payFrequency === "weekly") return addDays(date, -((weekdayOf(date) - spec.cutoffDay + 7) % 7));
  const ends = nearbyCutoffEnds(spec, date).filter((end) => end <= date);
  return ends[ends.length - 1];
}

function periodEndingOn(spec: CutoffSpec, end: string): PayPeriod {
  const start = spec.payFrequency === "weekly" ? addDays(end, -6) : addDays(latestEndOnOrBefore(spec, addDays(end, -1)), 1);
  return { start, end, payDate: addDays(end, spec.payDateOffsetDays) };
}

/** The most recent period whose cutoff has passed by `date` (the one a run is due for). */
export function periodEndingOnOrBefore(spec: CutoffSpec, date: string): PayPeriod {
  return periodEndingOn(spec, latestEndOnOrBefore(spec, date));
}

export function nextPeriod(spec: CutoffSpec, period: PayPeriod): PayPeriod {
  if (spec.payFrequency === "weekly") return periodEndingOn(spec, addDays(period.end, 7));
  const end = nearbyCutoffEnds(spec, period.end).find((candidate) => candidate > period.end)!;
  return periodEndingOn(spec, end);
}

/** The period that contains `date` (for "the current cutoff"). */
export function periodContaining(spec: CutoffSpec, date: string): PayPeriod {
  return nextPeriod(spec, periodEndingOnOrBefore(spec, addDays(date, -1)));
}
