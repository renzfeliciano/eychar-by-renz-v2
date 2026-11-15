import { addDays } from "@/lib/date-key";

export const PAY_FREQUENCIES = ["weekly", "bi-weekly", "semi-monthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  "semi-monthly": "Semi-monthly",
  monthly: "Monthly",
};

/** How many pay periods a month holds on average: a weekly payroll pays 52 times over 12 months, a bi-weekly one 26. */
export function periodsPerMonth(frequency: PayFrequency): number {
  if (frequency === "monthly") return 1;
  if (frequency === "semi-monthly") return 2;
  if (frequency === "bi-weekly") return 26 / 12;
  return 52 / 12;
}

export function perPeriodFromMonthly(monthlyAmount: number, frequency: PayFrequency): number {
  return monthlyAmount / periodsPerMonth(frequency);
}

/**
 * Whether a period ending on `periodEnd` is the month's last cutoff, for
 * contributions deducted once a month. Semi-monthly cutoffs end on the 15th
 * or earlier (first) and the 16th or later (second); a weekly or bi-weekly period is
 * the month's last when the next one ends in another month.
 */
export function isLastCutoffOfMonth(frequency: PayFrequency, periodEnd: string): boolean {
  if (frequency === "monthly") return true;
  if (frequency === "semi-monthly") return Number(periodEnd.slice(8, 10)) >= 16;
  return addDays(periodEnd, frequency === "bi-weekly" ? 14 : 7).slice(0, 7) !== periodEnd.slice(0, 7);
}

/**
 * Art. 103 (Labor Code) as the sources read it: wages are paid at least twice a month, at most 16 days apart.
 * Monthly pay stays HR's choice (owner, 2026-11-14), but choosing it means ticking this acknowledgement, which is
 * stored with the policy or schedule and audited; until then the dashboard lists it as a compliance risk.
 */
export const MONTHLY_PAY_WARNING =
  "The Labor Code (Art. 103) requires wages to be paid at least twice a month, no more than 16 days apart. Paying monthly can be challenged for rank-and-file employees.";
export const MONTHLY_PAY_ACKNOWLEDGEMENT = "I understand the risk and choose monthly pay for this payroll.";
