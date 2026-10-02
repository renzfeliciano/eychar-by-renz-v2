/**
 * Seeded defaults for a payroll policy's pay premiums (Philippine Labor Code
 * values). They are the schema and validation defaults, and the fallback
 * when a policy saved before these fields existed is read without Mongoose
 * defaults (`.lean()`), so older policies and past runs read exactly as
 * before. Configuration, not formulas: each policy can set its own
 * (AGENTS.md §2, §28).
 */
export const PAY_PREMIUM_DEFAULTS = {
  /** Overtime pay as a multiple of the hourly rate (1.25 = 125%). */
  overtimeMultiplier: 1.25,
  /** Pay for a rest day worked, as a multiple of the daily rate (1.3 = 130%). */
  restDayMultiplier: 1.3,
  /** 13th month pay is the basic pay earned in the year divided by this (PD 851: one twelfth). */
  thirteenthMonthDivisor: 12,
} as const;

export type PayPremiums = { -readonly [K in keyof typeof PAY_PREMIUM_DEFAULTS]: number };

/** A policy's premiums, with the defaults filled in for policies saved before the fields existed. */
export function payPremiumsOf(policy: { [K in keyof PayPremiums]?: number | null } | null | undefined): PayPremiums {
  return {
    overtimeMultiplier: policy?.overtimeMultiplier ?? PAY_PREMIUM_DEFAULTS.overtimeMultiplier,
    restDayMultiplier: policy?.restDayMultiplier ?? PAY_PREMIUM_DEFAULTS.restDayMultiplier,
    thirteenthMonthDivisor: policy?.thirteenthMonthDivisor ?? PAY_PREMIUM_DEFAULTS.thirteenthMonthDivisor,
  };
}

/** 1.25 → "125%". */
export function formatMultiplierPercent(multiplier: number): string {
  return `${Number((multiplier * 100).toPrecision(12))}%`;
}
