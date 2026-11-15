import { dateToDateKey } from "@/lib/date-key";

/**
 * An employment's last day as payroll should read it: its end date, or, while an end is only scheduled
 * (payroll plan Phase 5a slice 3), the scheduled last working day. So a run prepared during the notice period
 * stops paying after that day even before the daily job applies the ending. Null for an open employment.
 */
export function employmentLastDay(row: { effectiveTo?: Date | null; scheduledEnd?: { effectiveTo: Date } | null }): string | null {
  if (row.effectiveTo) return dateToDateKey(row.effectiveTo);
  if (row.scheduledEnd?.effectiveTo) return dateToDateKey(row.scheduledEnd.effectiveTo);
  return null;
}
