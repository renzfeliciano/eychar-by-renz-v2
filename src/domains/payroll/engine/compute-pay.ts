import { computeProgressiveBracketTax, type TaxBracket } from "../payroll-tax";
import { computeMonthlyContributionExact, type ContributionRule } from "./contributions";
import { roundMoney, sumMoney } from "./money";
import { periodsPerMonth, type PayFrequency } from "./pay-frequency";

export type RateType = "monthly" | "daily";

export type PayAllowance = { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean };

export type PayCompensation = { rateType: RateType; rate: number; allowances: PayAllowance[]; minimumWageEarner: boolean };

export type PayPolicy = {
  payFrequency: PayFrequency;
  /** Paid workdays in a year, used to turn a monthly rate into a daily one (e.g. 261 for a 5-day week, 313 for 6). */
  workDaysPerYear: number;
  hoursPerDay: number;
  deductLateAndUndertime: boolean;
  contributionTiming: "every_cutoff" | "last_cutoff_of_month";
};

export type PayRules = { taxTable: TaxBracket[]; contributions: ContributionRule[] };

/** The employee's attendance over the period, already summarized (see payroll-attendance.ts). */
export type PayAttendance = {
  /** Workdays in the period under the payroll policy's work week. */
  scheduledDays: number;
  /** Of those, the days the employee was actually employed (a mid-period hire or separation has fewer). */
  eligibleDays: number;
  daysWorked: number;
  paidLeaveDays: number;
  absentDays: number;
  /** Eligible workdays with no attendance record at all. */
  missingDays: number;
  /** Days worked outside the policy's work week (paid through an adjustment, not automatically). */
  restDaysWorked?: number;
  lateMinutes: number;
  undertimeMinutes: number;
};

export type PayAdjustment = { category: string; label: string; direction: "earning" | "deduction"; amount: number; taxable: boolean };

export type PayInput = {
  compensation: PayCompensation;
  policy: PayPolicy;
  rules: PayRules;
  attendance: PayAttendance;
  adjustments: PayAdjustment[];
  isLastCutoffOfMonth: boolean;
};

export type EarningLine = { code: string; label: string; amount: number; taxable: boolean };
export type DeductionLine = { code: string; label: string; amount: number };
export type ContributionLine = { code: string; name: string; employee: number; employer: number; extra: number; extraLabel?: string };
export type PayWarning = { code: string; message: string; blocking: boolean };

export type PayResult = {
  rateType: RateType;
  rate: number;
  monthlyBasic: number;
  dailyRate: number;
  hourlyRate: number;
  earnings: EarningLine[];
  contributions: ContributionLine[];
  deductions: DeductionLine[];
  grossPay: number;
  taxableIncome: number;
  tax: number;
  employeeContributions: number;
  employerContributions: number;
  totalDeductions: number;
  netPay: number;
  warnings: PayWarning[];
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const formatAmount = (value: number) => roundMoney(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * One employee's pay for one period: pure arithmetic over already-resolved
 * inputs, so the same inputs always give the same payslip (AGENTS.md §28).
 * Every line is rounded to centavos as it is produced and totals are sums
 * of rounded lines, so the payslip always adds up.
 *
 * - Monthly-rated: the period's share of the monthly rate, less absences
 *   and tardiness at the derived daily/hourly rate. A mid-period hire or
 *   separation is paid per eligible workday instead.
 * - Daily-rated: days worked plus paid leave, times the daily rate.
 * - Contributions use monthly basic pay as the base (a daily rate's monthly
 *   equivalent for daily-rated staff) and are deducted per cutoff or once
 *   on the month's last cutoff, as the policy says.
 * - Withholding tax applies to taxable earnings less the employee's
 *   contributions; minimum wage earners are exempt. Other deductions
 *   (loans, cash advances) come off after tax.
 */
export function computeEmployeePay({ compensation, policy, rules, attendance, adjustments, isLastCutoffOfMonth }: PayInput): PayResult {
  const { rateType, rate } = compensation;
  const monthlyBasic = rateType === "monthly" ? rate : roundMoney((rate * policy.workDaysPerYear) / 12);
  const dailyRate = rateType === "monthly" ? roundMoney((rate * 12) / policy.workDaysPerYear) : rate;
  const hourlyRate = roundMoney(dailyRate / policy.hoursPerDay);
  const perMonth = periodsPerMonth(policy.payFrequency);
  const isPartial = attendance.eligibleDays < attendance.scheduledDays;
  const warnings: PayWarning[] = [];

  const earnings: EarningLine[] = [];
  if (rateType === "monthly") {
    earnings.push(
      isPartial
        ? { code: "basic", label: `Basic pay (${attendance.eligibleDays} of ${attendance.scheduledDays} days)`, amount: roundMoney(dailyRate * attendance.eligibleDays), taxable: true }
        : { code: "basic", label: "Basic pay", amount: roundMoney(rate / perMonth), taxable: true },
    );
    if (attendance.absentDays > 0) {
      earnings.push({ code: "absences", label: `Absences (${plural(attendance.absentDays, "day")})`, amount: -roundMoney(dailyRate * attendance.absentDays), taxable: true });
    }
  } else {
    const paidDays = attendance.daysWorked + attendance.paidLeaveDays;
    earnings.push({ code: "basic", label: `Basic pay (${plural(paidDays, "day")} × ${rate.toFixed(2)})`, amount: roundMoney(dailyRate * paidDays), taxable: true });
  }

  const shortMinutes = attendance.lateMinutes + attendance.undertimeMinutes;
  if (policy.deductLateAndUndertime && shortMinutes > 0) {
    earnings.push({ code: "tardiness", label: `Tardiness & undertime (${shortMinutes} min)`, amount: -roundMoney((hourlyRate * shortMinutes) / 60), taxable: true });
  }

  for (const allowance of compensation.allowances) {
    if (allowance.basis === "daily") {
      if (attendance.daysWorked === 0) continue;
      earnings.push({ code: "allowance", label: `${allowance.name} (${plural(attendance.daysWorked, "day")})`, amount: roundMoney(allowance.amount * attendance.daysWorked), taxable: allowance.taxable });
    } else {
      const share = isPartial && attendance.scheduledDays > 0 ? attendance.eligibleDays / attendance.scheduledDays : 1;
      earnings.push({ code: "allowance", label: allowance.name, amount: roundMoney((allowance.amount / perMonth) * share), taxable: allowance.taxable });
    }
  }

  const deductions: DeductionLine[] = [];
  for (const adjustment of adjustments) {
    const amount = roundMoney(adjustment.amount);
    if (adjustment.direction === "earning") earnings.push({ code: adjustment.category, label: adjustment.label, amount, taxable: adjustment.taxable });
    else deductions.push({ code: adjustment.category, label: adjustment.label, amount });
  }

  const contributionShare = policy.contributionTiming === "every_cutoff" ? 1 / perMonth : isLastCutoffOfMonth ? 1 : 0;
  const contributions: ContributionLine[] = rules.contributions.map((rule) => {
    const monthly = computeMonthlyContributionExact(rule, monthlyBasic);
    return {
      code: rule.code,
      name: rule.name,
      employee: roundMoney(monthly.employee * contributionShare),
      employer: roundMoney(monthly.employer * contributionShare),
      extra: roundMoney(monthly.extra * contributionShare),
      extraLabel: rule.extraLabel ?? undefined,
    };
  });

  const grossPay = sumMoney(earnings.map((line) => line.amount));
  const employeeContributions = sumMoney(contributions.map((line) => line.employee));
  const employerContributions = sumMoney(contributions.map((line) => line.employer + line.extra));
  const taxableIncome = Math.max(0, sumMoney([...earnings.filter((line) => line.taxable).map((line) => line.amount), -employeeContributions]));
  const tax = compensation.minimumWageEarner ? 0 : roundMoney(computeProgressiveBracketTax(taxableIncome, rules.taxTable));
  const totalDeductions = sumMoney([employeeContributions, tax, ...deductions.map((line) => line.amount)]);
  const netPay = sumMoney([grossPay, -totalDeductions]);

  if (attendance.missingDays > 0) {
    warnings.push({
      code: "missing_attendance",
      message: `${plural(attendance.missingDays, "scheduled workday")} ${attendance.missingDays === 1 ? "has" : "have"} no attendance record; ${rateType === "monthly" ? "paid as worked" : "not paid"}.`,
      blocking: false,
    });
  }
  const restDaysWorked = attendance.restDaysWorked ?? 0;
  if (restDaysWorked > 0) {
    warnings.push({
      code: "rest_day_work",
      message: `Worked ${plural(restDaysWorked, "rest day")}. Add rest day pay as an adjustment (130% of the daily rate is ₱${formatAmount(dailyRate * 1.3)} a day).`,
      blocking: false,
    });
  }
  if (netPay < 0) warnings.push({ code: "negative_net_pay", message: "Net pay is negative. Reduce the deductions before submitting.", blocking: true });

  return {
    rateType,
    rate,
    monthlyBasic,
    dailyRate,
    hourlyRate,
    earnings,
    contributions,
    deductions,
    grossPay,
    taxableIncome,
    tax,
    employeeContributions,
    employerContributions,
    totalDeductions,
    netPay,
    warnings,
  };
}
