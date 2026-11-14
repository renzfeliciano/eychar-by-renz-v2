import { addDays, weekdayOf } from "@/lib/date-key";
import type { PayAllowance, PayCompensation } from "./compute-pay";

/**
 * When pay terms change inside a pay period, the period is paid at the blend
 * of the terms in force, weighted by the scheduled workdays each one covered.
 * Philippine practice pays each day at the rate in effect that day, and the
 * workday weighting is the rule agreed for this company: each employee has
 * their own schedule, so the working day is the unit, not the calendar day.
 *
 * Monthly and daily rates are blended through their monthly equivalent (daily
 * × work days per year ÷ 12), so the result is the same whichever way the
 * terms were written. The blended terms take the rate type of the last
 * segment, so a change of rate type mid-period still reads sensibly.
 */

export type WeightedTerms = { terms: PayCompensation; scheduledDays: number };

/** Scheduled workdays in [from, to] that fall inside the period, on the policy's work week. */
export function scheduledDaysInRange(periodDays: string[], workWeekDays: number[], from: string, to: string): number {
  return periodDays.filter((day) => day >= from && day <= to && workWeekDays.includes(weekdayOf(day))).length;
}

/** The day before a date key. */
export function dayBefore(key: string): string {
  return addDays(key, -1);
}

function monthlyEquivalent(rateType: "monthly" | "daily", rate: number, workDaysPerYear: number): number {
  return rateType === "monthly" ? rate : (rate * workDaysPerYear) / 12;
}

function fromMonthlyEquivalent(rateType: "monthly" | "daily", monthly: number, workDaysPerYear: number): number {
  return rateType === "monthly" ? monthly : (monthly * 12) / workDaysPerYear;
}

/**
 * Blend the pay terms across a period. One segment comes back unchanged, so
 * a period with no change in terms pays exactly as before.
 */
export function blendPayTerms(segments: WeightedTerms[], workDaysPerYear: number): PayCompensation {
  if (segments.length === 0) throw new Error("blendPayTerms needs at least one segment.");
  if (segments.length === 1) return segments[0].terms;

  const totalDays = segments.reduce((sum, segment) => sum + segment.scheduledDays, 0);
  const weights = segments.map((segment) => (totalDays > 0 ? segment.scheduledDays / totalDays : 1 / segments.length));
  const last = segments[segments.length - 1].terms;

  const monthlyRate = segments.reduce((sum, segment, index) => sum + weights[index] * monthlyEquivalent(segment.terms.rateType, segment.terms.rate, workDaysPerYear), 0);

  // Allowances: blend each name's monthly equivalent. Basis and tax treatment come from the latest segment that names it.
  const names = [...new Set(segments.flatMap((segment) => segment.terms.allowances.map((allowance) => allowance.name)))];
  const allowances: PayAllowance[] = names.map((name) => {
    let monthly = 0;
    let latest: PayAllowance | null = null;
    for (let index = 0; index < segments.length; index += 1) {
      const allowance = segments[index].terms.allowances.find((candidate) => candidate.name === name);
      if (!allowance) continue;
      monthly += weights[index] * monthlyEquivalent(allowance.basis, allowance.amount, workDaysPerYear);
      latest = allowance;
    }
    const basis = latest!.basis;
    return { name, amount: fromMonthlyEquivalent(basis, monthly, workDaysPerYear), basis, taxable: latest!.taxable };
  });

  return {
    rateType: last.rateType,
    rate: fromMonthlyEquivalent(last.rateType, monthlyRate, workDaysPerYear),
    allowances,
    minimumWageEarner: last.minimumWageEarner,
  };
}
