import { daysBetween } from "@/domains/dashboard/action-queue";
import { RISK_WINDOW_DAYS } from "@/domains/dashboard/compliance-risks";

export type ExpiryStatus = "expired" | "expiring" | "valid";

/**
 * Where a validity date ("YYYY-MM-DD") stands against today's key: `expired` once it is before today,
 * `expiring` from today through the dashboard's 30-day window (so the day it runs out still reads as
 * "expiring soon"), `valid` beyond that, and `null` when there is no date (nothing to flag).
 * The profile chips and the dashboard alerts share this window, so they never disagree.
 */
export function expiryStatus(validUntilKey: string | null | undefined, todayKey: string): ExpiryStatus | null {
  if (!validUntilKey) return null;
  const days = daysBetween(todayKey, validUntilKey);
  if (days < 0) return "expired";
  return days <= RISK_WINDOW_DAYS ? "expiring" : "valid";
}
