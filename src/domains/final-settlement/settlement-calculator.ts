import { roundMoney, sumMoney } from "@/domains/payroll/engine/money";
import { addDays, dateKeysBetween, formatDateRange, weekdayOf } from "@/lib/date-key";

export type SettlementLineCode = "salary_balance" | "leave_encashment" | "thirteenth_month" | "accountability" | "manual";

export type SettlementLine = {
  code: SettlementLineCode;
  direction: "earning" | "deduction";
  label: string;
  amount: number;
  /** Which record it came from, and how it was worked out (ADR-032: every peso traceable). */
  source: string;
  basis: string;
  clearanceItemId?: string;
  manualLineId?: string;
};

export type ManualLine = { id: string; direction: "earning" | "deduction"; label: string; amount: number; reason: string };

export type SettlementInputs = {
  lastWorkingDay: string;
  /** Last day already covered by an approved or released payroll run; null if none this year. */
  lastPaidThrough: string | null;
  rateType: "monthly" | "daily";
  rate: number;
  workDaysPerYear: number;
  workWeekDays: number[];
  /** Basic pay (net of absences and tardiness) in approved or released payroll this calendar year. */
  basicEarnedThisYear: number;
  thirteenthMonthPaidThisYear: number;
  /** Unused days of leave types HR marked convertible to cash. */
  convertibleLeave: { leaveTypeName: string; days: number }[];
  accountabilities: { itemId: string; label: string; amount: number }[];
  manualLines: ManualLine[];
};

const PESO = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const peso = (value: number) => PESO.format(value);

export function countWorkdays(from: string, to: string, workWeekDays: number[]): number {
  if (from > to) return 0;
  return dateKeysBetween(from, to).filter((key) => workWeekDays.includes(weekdayOf(key))).length;
}

/**
 * The separation pay-out (ADR-032), as a pure function of its inputs: salary
 * for unpaid workdays up to the last day, leave encashment, the pro-rated
 * 13th month, clearance accountabilities and HR's manual lines (each with a
 * reason). Tax true-up and statutory contributions come in a later phase.
 */
export function computeSettlement(inputs: SettlementInputs) {
  const dailyRate = inputs.rateType === "monthly" ? roundMoney((inputs.rate * 12) / inputs.workDaysPerYear) : inputs.rate;
  const lines: SettlementLine[] = [];

  const unpaidFrom = inputs.lastPaidThrough ? addDays(inputs.lastPaidThrough, 1) : `${inputs.lastWorkingDay.slice(0, 7)}-01`;
  const unpaidDays = countWorkdays(unpaidFrom, inputs.lastWorkingDay, inputs.workWeekDays);
  const salaryBalance = roundMoney(unpaidDays * dailyRate);
  if (unpaidDays > 0) {
    lines.push({
      code: "salary_balance",
      direction: "earning",
      label: "Salary balance",
      amount: salaryBalance,
      source: "Attendance & pay terms",
      basis: `${unpaidDays} workday${unpaidDays === 1 ? "" : "s"} (${formatDateRange(unpaidFrom, inputs.lastWorkingDay)}) × ${peso(dailyRate)} daily rate`,
    });
  }

  for (const leave of inputs.convertibleLeave) {
    if (leave.days <= 0) continue;
    lines.push({
      code: "leave_encashment",
      direction: "earning",
      label: `Leave encashment: ${leave.leaveTypeName}`,
      amount: roundMoney(leave.days * dailyRate),
      source: "Leave balances",
      basis: `${leave.days} day${leave.days === 1 ? "" : "s"} × ${peso(dailyRate)}`,
    });
  }

  const thirteenth = roundMoney((inputs.basicEarnedThisYear + salaryBalance) / 12 - inputs.thirteenthMonthPaidThisYear);
  if (thirteenth > 0) {
    lines.push({
      code: "thirteenth_month",
      direction: "earning",
      label: "Pro-rated 13th month pay",
      amount: thirteenth,
      source: "Payroll this year",
      basis: `(${peso(inputs.basicEarnedThisYear)} earned + ${peso(salaryBalance)} salary balance) ÷ 12 − ${peso(inputs.thirteenthMonthPaidThisYear)} already paid`,
    });
  }

  for (const manual of inputs.manualLines.filter((line) => line.direction === "earning")) {
    lines.push({ code: "manual", direction: "earning", label: manual.label, amount: roundMoney(manual.amount), source: "Added by HR", basis: manual.reason, manualLineId: manual.id });
  }
  for (const item of inputs.accountabilities) {
    lines.push({ code: "accountability", direction: "deduction", label: item.label, amount: roundMoney(item.amount), source: "Clearance", basis: "Flagged during clearance", clearanceItemId: item.itemId });
  }
  for (const manual of inputs.manualLines.filter((line) => line.direction === "deduction")) {
    lines.push({ code: "manual", direction: "deduction", label: manual.label, amount: roundMoney(manual.amount), source: "Added by HR", basis: manual.reason, manualLineId: manual.id });
  }

  const earnings = sumMoney(lines.filter((line) => line.direction === "earning").map((line) => line.amount));
  const deductions = sumMoney(lines.filter((line) => line.direction === "deduction").map((line) => line.amount));
  return { dailyRate, lines, totals: { earnings, deductions, net: roundMoney(earnings - deductions) } };
}
