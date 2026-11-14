/**
 * Seeded defaults for a payroll policy's pay premiums (Philippine Labor Code
 * values). They are the schema and validation defaults, and the fallback
 * when a policy saved before these fields existed is read without Mongoose
 * defaults (`.lean()`), so older policies and past runs read exactly as
 * before. Configuration, not formulas: each policy can set its own
 * (ENGINEERING.md §2, §28).
 */
export const PAY_PREMIUM_DEFAULTS = {
  /** Overtime pay as a multiple of the hourly rate (1.25 = 125%). */
  overtimeMultiplier: 1.25,
  /** Pay for a rest day worked, as a multiple of the daily rate (1.3 = 130%). */
  restDayMultiplier: 1.3,
  /** 13th month pay is the basic pay earned in the year divided by this (PD 851: one twelfth). */
  thirteenthMonthDivisor: 12,
  // Holiday and night premiums (attendance plan Phase 5, approved at GATE 3 on
  // 2026-11-14 against the DOLE handbook figures; verify against the official
  // Labor Code text before relying on them). Each is a multiple of the daily
  // rate for the first 8 hours worked that day.
  /** Special non-working day worked (130%). */
  specialHolidayMultiplier: 1.3,
  /** Special non-working day that is also the employee's rest day (150%). */
  specialHolidayRestDayMultiplier: 1.5,
  /** Regular holiday worked (Art. 94: 200%). */
  regularHolidayMultiplier: 2,
  /** Regular holiday that is also the employee's rest day (260%). */
  regularHolidayRestDayMultiplier: 2.6,
  /** Overtime on a rest day or holiday: this times that day's rate (130%). */
  premiumOvertimeMultiplier: 1.3,
  /** Night work, 10 p.m. to 6 a.m. (Art. 86): this share of the hour's rate (10%). */
  nightDifferentialRate: 0.1,
} as const;

export type PayPremiums = { -readonly [K in keyof typeof PAY_PREMIUM_DEFAULTS]: number };

/** A policy's premiums, with the defaults filled in for policies saved before the fields existed. */
export function payPremiumsOf(policy: { [K in keyof PayPremiums]?: number | null } | null | undefined): PayPremiums {
  const filled = {} as PayPremiums;
  for (const key of Object.keys(PAY_PREMIUM_DEFAULTS) as (keyof PayPremiums)[]) filled[key] = policy?.[key] ?? PAY_PREMIUM_DEFAULTS[key];
  return filled;
}

/** 1.25 → "125%". */
export function formatMultiplierPercent(multiplier: number): string {
  return `${Number((multiplier * 100).toPrecision(12))}%`;
}
