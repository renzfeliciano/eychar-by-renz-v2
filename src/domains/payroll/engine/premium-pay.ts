import type { DayType } from "@/domains/attendance/day-calc";
import { ADJUSTMENT_CATEGORIES } from "../adjustment-categories";
import { roundMoney } from "./money";
import type { PayPremiums } from "./premiums";

/**
 * Overtime, rest-day, holiday and night pay from the stored attendance day
 * results (attendance plan Phase 5; formulas approved at GATE 3, 2026-11-14).
 * Pure arithmetic over resolved inputs, like compute-pay.ts. Every rate is
 * the payroll policy's (premiums.ts), never a constant here.
 *
 * - Regular hours on a premium day: the daily rate times the day's multiplier,
 *   prorated over the policy's hours. When basic pay already covers the day
 *   (a day in the payroll's work week), only the extra (multiplier − 1) is added.
 * - Overtime: the hourly rate times the ordinary overtime multiplier, or on a
 *   premium day the day's multiplier times the premium overtime multiplier.
 * - Night differential: the night share of the hour's rate: the day's rate,
 *   or the overtime rate for night minutes that are also overtime.
 * - The period's minutes are added up per kind of day: one line per kind and
 *   pay, rounded as produced.
 */

export type PremiumDay = {
  date: string;
  dayType: DayType;
  /** The attendance rest day; a day outside the payroll's work week counts as one too. */
  restDay: boolean;
  /** Whether basic pay already pays this day (it's in the payroll policy's work week). */
  inBasic: boolean;
  /** Worked minutes that aren't overtime. */
  regularMinutes: number;
  /** Approved overtime only. */
  overtimeMinutes: number;
  nightMinutes: number;
  /** Of the night minutes, those that are also (approved) overtime. */
  nightOvertimeMinutes: number;
};

export type PremiumLine = { code: "overtime" | "rest_day_pay" | "holiday_pay" | "night_differential"; label: string; amount: number; taxable: boolean };

type Kind = "ordinary" | "rest" | "special" | "special_rest" | "regular" | "regular_rest";

const KIND_ORDER: Kind[] = ["ordinary", "rest", "special", "special_rest", "regular", "regular_rest"];
const KIND_LABEL: Record<Kind, string> = {
  ordinary: "ordinary day",
  rest: "rest day",
  special: "special non-working day",
  special_rest: "special day on a rest day",
  regular: "regular holiday",
  regular_rest: "regular holiday on a rest day",
};

function kindOf(day: PremiumDay): Kind {
  const rest = day.restDay || !day.inBasic;
  if (day.dayType === "regular_holiday") return rest ? "regular_rest" : "regular";
  if (day.dayType === "special_holiday") return rest ? "special_rest" : "special";
  return rest ? "rest" : "ordinary";
}

function dayMultiplier(kind: Kind, premiums: PayPremiums): number {
  switch (kind) {
    case "ordinary":
      return 1;
    case "rest":
      return premiums.restDayMultiplier;
    case "special":
      return premiums.specialHolidayMultiplier;
    case "special_rest":
      return premiums.specialHolidayRestDayMultiplier;
    case "regular":
      return premiums.regularHolidayMultiplier;
    case "regular_rest":
      return premiums.regularHolidayRestDayMultiplier;
  }
}

function overtimeMultiplier(kind: Kind, premiums: PayPremiums): number {
  return kind === "ordinary" ? premiums.overtimeMultiplier : dayMultiplier(kind, premiums) * premiums.premiumOvertimeMultiplier;
}

const taxableOf = (code: PremiumLine["code"]) => ADJUSTMENT_CATEGORIES.find((category) => category.code === code)?.taxable ?? true;

/** 240 → "4 h", 150 → "2 h 30 min", 45 → "45 min". */
export function formatHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function premiumLines(input: { days: PremiumDay[]; dailyRate: number; hourlyRate: number; hoursPerDay: number; premiums: PayPremiums }): PremiumLine[] {
  const { dailyRate, hourlyRate, premiums } = input;
  const capMinutes = input.hoursPerDay * 60;
  const lines: PremiumLine[] = [];
  const push = (code: PremiumLine["code"], label: string, amount: number) => {
    const rounded = roundMoney(amount);
    if (rounded !== 0) lines.push({ code, label, amount: rounded, taxable: taxableOf(code) });
  };

  for (const kind of KIND_ORDER) {
    const days = input.days.filter((day) => kindOf(day) === kind);
    if (days.length === 0) continue;
    const multiplier = dayMultiplier(kind, premiums);
    const otRate = overtimeMultiplier(kind, premiums);
    const label = KIND_LABEL[kind];

    // Regular hours: the part of the day's pay basic doesn't already cover.
    let regularMinutes = 0;
    let weighted = 0;
    for (const day of days) {
      const factor = day.inBasic ? multiplier - 1 : multiplier;
      if (factor <= 0 || day.regularMinutes <= 0) continue;
      regularMinutes += day.regularMinutes;
      weighted += factor * day.regularMinutes;
    }
    if (regularMinutes > 0) {
      const code = kind === "rest" ? "rest_day_pay" : "holiday_pay";
      const suffix = days.every((day) => day.inBasic) ? "premium" : "pay";
      push(code, `${capitalize(label)} ${suffix} (${formatHoursMinutes(regularMinutes)})`, (dailyRate * weighted) / capMinutes);
    }

    const overtime = days.reduce((sum, day) => sum + day.overtimeMinutes, 0);
    if (overtime > 0) push("overtime", `Overtime, ${label} (${formatHoursMinutes(overtime)})`, (hourlyRate * otRate * overtime) / 60);

    const night = days.reduce((sum, day) => sum + day.nightMinutes, 0);
    const nightOvertime = days.reduce((sum, day) => sum + Math.min(day.nightOvertimeMinutes, day.nightMinutes), 0);
    if (night > 0) {
      const amount = (hourlyRate * premiums.nightDifferentialRate * (multiplier * (night - nightOvertime) + otRate * nightOvertime)) / 60;
      push("night_differential", `Night differential, ${label} (${formatHoursMinutes(night)})`, amount);
    }
  }
  return lines;
}
