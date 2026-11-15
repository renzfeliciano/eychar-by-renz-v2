import { roundMoney, sumMoney } from "@/domains/payroll/engine/money";
import { addDays, dateKeysBetween, formatDateRange, weekdayOf } from "@/lib/date-key";
import { payPremiumsOf } from "@/domains/payroll/engine/premiums";
import { formatMoney } from "@/lib/money";

export type SettlementLineCode = "salary_balance" | "leave_encashment" | "thirteenth_month" | "accountability" | "manual" | "contribution" | "tax" | "tax_refund";

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
  /** Earnings only: taxable compensation (payroll plan Phase 5; the tax true-up and the final run read it). */
  taxable?: boolean;
};

export type ManualLine = { id: string; direction: "earning" | "deduction"; label: string; amount: number; reason: string; taxable?: boolean | null };

/** Payroll plan Phase 5: the month's contributions still due and the year's tax true-up, worked out by the payroll engine. */
export type SettlementStatutory = {
  contributions: { code: string; name: string; employee: number; employer: number; extra: number; basis: string }[];
  /** Annual tax due − everything withheld, including this settlement's lines: positive is collected, negative refunded. */
  taxDifference: number;
  taxBasis: string;
};

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
  /** The payroll policy's 13th month divisor (basic pay earned ÷ this); PAY_PREMIUM_DEFAULTS when unset. */
  thirteenthMonthDivisor?: number;
  /** Unused days of leave types HR marked convertible to cash. */
  convertibleLeave: { leaveTypeName: string; days: number }[];
  accountabilities: { itemId: string; label: string; amount: number }[];
  manualLines: ManualLine[];
  /** Rule data: leave converted to cash is non-taxable up to this many days a year; null = all taxable. */
  deMinimisLeaveDays?: number | null;
  statutory?: SettlementStatutory | null;
};

const peso = formatMoney;

export function countWorkdays(from: string, to: string, workWeekDays: number[]): number {
  if (from > to) return 0;
  return dateKeysBetween(from, to).filter((key) => workWeekDays.includes(weekdayOf(key))).length;
}

/**
 * The separation pay-out (ADR-032), as a pure function of its inputs: salary
 * for unpaid workdays up to the last day, leave encashment, the pro-rated
 * 13th month, clearance accountabilities and HR's manual lines (each with a
 * reason), and (payroll plan Phase 5) the month's contributions still due and
 * the year's tax true-up, which the service works out with the payroll engine
 * and passes in as `statutory`.
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
      taxable: true,
    });
  }

  // Leave converted to cash: non-taxable up to the de minimis days (rule data), taxable beyond them.
  let exemptDaysLeft = inputs.deMinimisLeaveDays ?? 0;
  const dayLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;
  for (const leave of inputs.convertibleLeave) {
    if (leave.days <= 0) continue;
    const exempt = Math.min(leave.days, exemptDaysLeft);
    const taxed = roundMoney(leave.days - exempt);
    exemptDaysLeft = roundMoney(exemptDaysLeft - exempt);
    const parts = [
      ...(exempt > 0 ? [{ days: exempt, taxable: false }] : []),
      ...(taxed > 0 ? [{ days: taxed, taxable: true }] : []),
    ];
    for (const part of parts) {
      lines.push({
        code: "leave_encashment",
        direction: "earning",
        label: `Leave encashment: ${leave.leaveTypeName}${parts.length > 1 ? (part.taxable ? " (taxable part)" : " (non-taxable part)") : ""}`,
        amount: roundMoney(part.days * dailyRate),
        source: "Leave balances",
        basis: `${dayLabel(part.days)} × ${peso(dailyRate)}${part.taxable ? (inputs.deMinimisLeaveDays ? `, beyond the ${dayLabel(inputs.deMinimisLeaveDays)} de minimis limit` : "") : ", within the de minimis limit"}`,
        taxable: part.taxable,
      });
    }
  }

  const { thirteenthMonthDivisor } = payPremiumsOf(inputs);
  const thirteenth = roundMoney((inputs.basicEarnedThisYear + salaryBalance) / thirteenthMonthDivisor - inputs.thirteenthMonthPaidThisYear);
  if (thirteenth > 0) {
    lines.push({
      code: "thirteenth_month",
      direction: "earning",
      label: "Pro-rated 13th month pay",
      amount: thirteenth,
      source: "Payroll this year",
      basis: `(${peso(inputs.basicEarnedThisYear)} earned + ${peso(salaryBalance)} salary balance) ÷ ${thirteenthMonthDivisor} − ${peso(inputs.thirteenthMonthPaidThisYear)} already paid`,
      taxable: false,
    });
  }

  for (const manual of inputs.manualLines.filter((line) => line.direction === "earning")) {
    lines.push({ code: "manual", direction: "earning", label: manual.label, amount: roundMoney(manual.amount), source: "Added by HR", basis: manual.reason, manualLineId: manual.id, taxable: manual.taxable ?? true });
  }
  const statutory = inputs.statutory;
  if (statutory && statutory.taxDifference < 0) {
    lines.push({ code: "tax_refund", direction: "earning", label: "Tax refund (over-withheld this year)", amount: roundMoney(-statutory.taxDifference), source: "Payroll this year", basis: statutory.taxBasis, taxable: false });
  }
  for (const item of inputs.accountabilities) {
    lines.push({ code: "accountability", direction: "deduction", label: item.label, amount: roundMoney(item.amount), source: "Clearance", basis: "Flagged during clearance", clearanceItemId: item.itemId });
  }
  for (const manual of inputs.manualLines.filter((line) => line.direction === "deduction")) {
    lines.push({ code: "manual", direction: "deduction", label: manual.label, amount: roundMoney(manual.amount), source: "Added by HR", basis: manual.reason, manualLineId: manual.id });
  }
  for (const contribution of statutory?.contributions ?? []) {
    if (contribution.employee <= 0) continue;
    lines.push({ code: "contribution", direction: "deduction", label: `${contribution.name} (employee share still due)`, amount: roundMoney(contribution.employee), source: "Rule version", basis: contribution.basis });
  }
  if (statutory && statutory.taxDifference > 0) {
    lines.push({ code: "tax", direction: "deduction", label: "Withholding tax (year to date, still due)", amount: roundMoney(statutory.taxDifference), source: "Payroll this year", basis: statutory.taxBasis });
  }

  const earnings = sumMoney(lines.filter((line) => line.direction === "earning").map((line) => line.amount));
  const deductions = sumMoney(lines.filter((line) => line.direction === "deduction").map((line) => line.amount));
  return { dailyRate, lines, totals: { earnings, deductions, net: roundMoney(earnings - deductions) } };
}
