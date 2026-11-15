// A bonus run's amount per employee (e.g. a Christmas bonus). Pure: the run's settings and the
// employee's pay in, pesos out. HR picks the basis; nothing here is a legal rate.
import { roundMoney } from "./money";

export const BONUS_BASES = ["fixed", "percent_of_monthly", "months_of_pay", "days_of_pay"] as const;
export type BonusBasis = (typeof BONUS_BASES)[number];

export const BONUS_BASIS_LABELS: Record<BonusBasis, string> = {
  fixed: "Fixed amount",
  percent_of_monthly: "% of monthly salary",
  months_of_pay: "Months of pay",
  days_of_pay: "Days of pay",
};

/**
 * One employee's bonus. `monthlyBasic` is the monthly salary (a daily rate's monthly equivalent);
 * `dailyRate` the daily rate (a monthly salary's daily equivalent). With `prorateMonths`, the
 * amount is scaled by months served in the year out of 12 (capped at a full year).
 */
export function bonusAmount(input: { basis: BonusBasis; value: number; monthlyBasic: number; dailyRate: number; prorateMonths?: number }): number {
  const full =
    input.basis === "fixed"
      ? input.value
      : input.basis === "percent_of_monthly"
        ? (input.monthlyBasic * input.value) / 100
        : input.basis === "months_of_pay"
          ? input.monthlyBasic * input.value
          : input.dailyRate * input.value;
  const share = input.prorateMonths === undefined ? 1 : Math.min(Math.max(input.prorateMonths, 0), 12) / 12;
  return roundMoney(full * share);
}

/**
 * Months served in a calendar year, from the later of Jan 1 and the start of service to Dec 31: whole
 * calendar months, with a mid-month start counting the part of its month left (two decimals).
 */
export function monthsServedInYear(year: number, serviceStart: string): number {
  if (serviceStart > `${year}-12-31`) return 0;
  if (serviceStart < `${year}-01-01`) return 12;
  const [, month, day] = serviceStart.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round((12 - (month - 1) - (day - 1) / daysInMonth) * 100) / 100;
}

/** Whole months of service from the start date to `asOf` (a month counts once its day-of-month is reached). */
export function serviceMonths(serviceStart: string, asOf: string): number {
  const [fromYear, fromMonth, fromDay] = serviceStart.split("-").map(Number);
  const [toYear, toMonth, toDay] = asOf.split("-").map(Number);
  const months = (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0);
  return Math.max(months, 0);
}
