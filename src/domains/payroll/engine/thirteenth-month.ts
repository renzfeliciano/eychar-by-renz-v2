/**
 * 13th-month pay (PD 851; payroll plan Phase 3, Gate B approved 2026-11-14). Pure functions: no
 * database, no dates read from the clock. The final settlement and the 13th-month run both use
 * these, so the two can't disagree.
 *
 * Base = basic salary actually earned in the calendar year: the `basic` earning lines net of the
 * `absences` and `tardiness` lines. Overtime, premiums, allowances and adjustments are separate lines
 * and are left out. Amount = base ÷ the policy's divisor (12), less what was already paid that year.
 */
import { addDays, dateKeysBetween, daysInMonth } from "@/lib/date-key";
import { roundMoney, sumMoney } from "./money";
import type { PayFrequency } from "./pay-frequency";

/** PD 851's deadline, used when a policy doesn't set its own (month-day). */
export const THIRTEENTH_MONTH_PAY_BY_DEFAULT = "12-24";

/** A policy's 13th-month deadline as a date key for a year. */
export function thirteenthMonthDueDate(policy: { thirteenthMonthPayBy?: string | null } | null | undefined, year: number): string {
  return `${year}-${policy?.thirteenthMonthPayBy ?? THIRTEENTH_MONTH_PAY_BY_DEFAULT}`;
}

/** Earning lines that make up basic salary earned. */
export const THIRTEENTH_MONTH_BASE_CODES = ["basic", "absences", "tardiness"] as const;
const BASE_CODES = new Set<string>(THIRTEENTH_MONTH_BASE_CODES);

/** Basic salary earned in a set of payroll records' earning lines. */
export function basicEarnedFrom(earnings: { code: string; amount: number }[]): number {
  return sumMoney(earnings.filter((line) => BASE_CODES.has(line.code)).map((line) => line.amount));
}

/** base ÷ divisor − already paid, never below zero. */
export function thirteenthMonthAmount(input: { basicEarned: number; estimatedBasic?: number; divisor: number; alreadyPaid: number }): number {
  const owed = roundMoney((input.basicEarned + (input.estimatedBasic ?? 0)) / input.divisor - input.alreadyPaid);
  return Math.max(0, owed);
}

export type RemainderInput = {
  rateType: "monthly" | "daily";
  rate: number;
  payFrequency: PayFrequency;
  workDaysPerYear: number;
  workWeekDays: number[];
  /** First and last day not yet covered by an approved or released regular run (inclusive). */
  from: string;
  to: string;
  /** Whether the employee is employed (as current staff) on a day. */
  isEmployed: (date: string) => boolean;
};

/**
 * Basic pay the regular runs will most likely pay for the rest of the year (the December estimate,
 * owner decision 2026-11-14: estimate now, true up in January). Assumes full attendance.
 *
 * - Daily-rated: rate × scheduled workdays employed.
 * - Monthly-rated: the salary's share of each pay period, the way the engine pays it: a whole
 *   semi-monthly half (1st–15th, 16th–end) or month is rate ÷ 2 or rate; a part of one is pro-rated by
 *   calendar days employed in it. Weekly: rate × 12 ÷ 52 per week, pro-rated by days.
 * The actual December run can differ (absences, other cutoff days); the January true-up settles that.
 */
export function estimateRemainingBasic(input: RemainderInput): number {
  if (input.from > input.to) return 0;
  const days = dateKeysBetween(input.from, input.to);
  if (input.rateType === "daily") {
    const workdays = days.filter((day) => input.isEmployed(day) && input.workWeekDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())).length;
    return roundMoney(input.rate * workdays);
  }

  // Monthly-rated: walk the pay periods the remainder touches.
  let total = 0;
  for (const [periodStart, periodEnd, share] of payPeriodsTouching(input.from, input.to, input.payFrequency)) {
    const periodDays = dateKeysBetween(periodStart, periodEnd);
    const employedInRemainder = periodDays.filter((day) => day >= input.from && day <= input.to && input.isEmployed(day)).length;
    total += input.rate * share * (employedInRemainder / periodDays.length);
  }
  return roundMoney(total);
}

/** [start, end, share of the monthly salary] for each pay period overlapping [from, to]. */
function payPeriodsTouching(from: string, to: string, frequency: PayFrequency): [string, string, number][] {
  const periods: [string, string, number][] = [];
  if (frequency === "weekly") {
    // Weeks counted from the first unpaid day; a week the remainder only partly covers is pro-rated by days.
    for (let start = from; start <= to; start = addDays(start, 7)) periods.push([start, addDays(start, 6), 12 / 52]);
    return periods;
  }
  let [year, month] = from.split("-").map(Number);
  while (true) {
    const key = (day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const last = daysInMonth(year, month);
    if (key(1) > to) break;
    if (frequency === "semi-monthly") {
      periods.push([key(1), key(15), 0.5], [key(16), key(last), 0.5]);
    } else {
      periods.push([key(1), key(last), 1]);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods.filter(([start, end]) => end >= from && start <= to);
}
