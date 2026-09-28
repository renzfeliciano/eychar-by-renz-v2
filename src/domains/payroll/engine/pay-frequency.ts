import { addDays } from "@/lib/date-key";

export const PAY_FREQUENCIES = ["weekly", "semi-monthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  "semi-monthly": "Semi-monthly",
  monthly: "Monthly",
};

/** How many pay periods a month holds on average: a weekly payroll pays 52 times over 12 months. */
export function periodsPerMonth(frequency: PayFrequency): number {
  if (frequency === "monthly") return 1;
  if (frequency === "semi-monthly") return 2;
  return 52 / 12;
}

export function perPeriodFromMonthly(monthlyAmount: number, frequency: PayFrequency): number {
  return monthlyAmount / periodsPerMonth(frequency);
}

/**
 * Whether a period ending on `periodEnd` is the month's last cutoff, for
 * contributions deducted once a month. Semi-monthly cutoffs end on the 15th
 * or earlier (first) and the 16th or later (second); a weekly period is the
 * month's last when the next one ends in another month.
 */
export function isLastCutoffOfMonth(frequency: PayFrequency, periodEnd: string): boolean {
  if (frequency === "monthly") return true;
  if (frequency === "semi-monthly") return Number(periodEnd.slice(8, 10)) >= 16;
  return addDays(periodEnd, 7).slice(0, 7) !== periodEnd.slice(0, 7);
}
