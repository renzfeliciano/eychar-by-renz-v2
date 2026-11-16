import { ValidationError } from "@/shared/errors";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";

/**
 * A validity date as it arrives from a screen or the API: a "YYYY-MM-DD" key. Blank, `""` and `null` mean
 * "no date" (undefined). Anything else must be a real calendar day: "2026-02-30" and "soon" are refused.
 * The result is the stored form (UTC midnight of that day), like attendance and payroll dates.
 */
export function cleanValidUntil(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError("Enter a valid date.");
  const text = value.trim();
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || dateToDateKey(dateKeyToDate(text)) !== text) throw new ValidationError("Enter a valid date.");
  return dateKeyToDate(text);
}
