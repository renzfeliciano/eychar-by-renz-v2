import { computeProgressiveBracketTax, type TaxBracket } from "../payroll-tax";
import { computeMonthlyContributionExact, type ContributionRule } from "./contributions";
import { roundMoney, sumMoney } from "./money";
import { periodsPerMonth, type PayFrequency } from "./pay-frequency";
import { formatMultiplierPercent, payPremiumsOf, type PayPremiums } from "./premiums";
import { formatHoursMinutes, premiumLines, type PremiumDay } from "./premium-pay";
import { COMPUTED_PREMIUM_CATEGORIES } from "../adjustment-categories";
import { formatMoney } from "@/lib/money";

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
  /** Rest day pay as a multiple of the daily rate (the policy's; PAY_PREMIUM_DEFAULTS when unset). */
  restDayMultiplier?: number;
} & { [K in keyof PayPremiums]?: number | null };

export { COMPUTED_PREMIUM_CATEGORIES };

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
  /** Only on a run that computes premiums (attendance plan Phase 5). */
  premiums?: PremiumAttendance;
};

/** The attendance a run that computes premiums reads from the stored day results (attendance plan Phase 5). */
export type PremiumAttendance = {
  /** Every day worked that has a stored result. */
  days: PremiumDay[];
  /** Unworked regular holidays on workdays where the workday before was attended or on leave. */
  unworkedRegularHolidaysPaid: number;
  /** Unworked regular holidays where it wasn't (warned, never deducted). */
  regularHolidaysAbsentBefore: number;
  /** Overtime measured but not approved: not paid. */
  unapprovedOvertimeMinutes: number;
  missingCheckoutDays: number;
  /** Days worked whose record has no stored result (older records): read as before, no premiums. */
  withoutDayResult: number;
};

export type PayAdjustment = { category: string; label: string; direction: "earning" | "deduction"; amount: number; taxable: boolean };

export type PayInput = {
  compensation: PayCompensation;
  policy: PayPolicy;
  rules: PayRules;
  attendance: PayAttendance;
  adjustments: PayAdjustment[];
  isLastCutoffOfMonth: boolean;
  /**
   * The run computes overtime, rest-day, holiday and night pay from the stored
   * attendance day results (attendance plan Phase 5). Off for runs made before
   * it existed, which pay exactly as before.
   */
  computePremiums?: boolean;
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

/**
 * One employee's pay for one period: pure arithmetic over already-resolved
 * inputs, so the same inputs always give the same payslip (ENGINEERING.md §28).
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
/** The monthly basic contributions are computed on: the rate, or a daily rate's monthly equivalent. Shared with final pay. */
export function monthlyBasicFor(rateType: "monthly" | "daily", rate: number, workDaysPerYear: number): number {
  return rateType === "monthly" ? rate : roundMoney((rate * workDaysPerYear) / 12);
}

export function computeEmployeePay({ compensation, policy, rules, attendance, adjustments, isLastCutoffOfMonth, computePremiums }: PayInput): PayResult {
  const { rateType, rate } = compensation;
  const monthlyBasic = monthlyBasicFor(rateType, rate, policy.workDaysPerYear);
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

  const premiumInputs = computePremiums ? attendance.premiums : undefined;
  if (premiumInputs) {
    earnings.push(...premiumLines({ days: premiumInputs.days, dailyRate, hourlyRate, hoursPerDay: policy.hoursPerDay, premiums: payPremiumsOf(policy) }));
    // A monthly rate already pays regular holidays (the work-year divisor counts them); a daily rate doesn't.
    if (rateType === "daily" && premiumInputs.unworkedRegularHolidaysPaid > 0) {
      const count = premiumInputs.unworkedRegularHolidaysPaid;
      earnings.push({ code: "holiday_pay", label: `Regular holiday pay, not worked (${plural(count, "day")})`, amount: roundMoney(dailyRate * count), taxable: true });
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
  if (premiumInputs) {
    const manual = adjustments.filter((adjustment) => (COMPUTED_PREMIUM_CATEGORIES as readonly string[]).includes(adjustment.category));
    if (manual.length) {
      warnings.push({
        code: "manual_premium_adjustment",
        message: `This run computes overtime, rest day, holiday and night pay from attendance. Remove the manual ${[...new Set(manual.map((adjustment) => adjustment.label))].join(", ")} adjustment so it isn't paid twice.`,
        blocking: true,
      });
    }
    if (premiumInputs.unapprovedOvertimeMinutes > 0) {
      warnings.push({ code: "unapproved_overtime", message: `${formatHoursMinutes(premiumInputs.unapprovedOvertimeMinutes)} of overtime isn't approved and isn't paid. Approve it in Attendance, then recompute.`, blocking: false });
    }
    if (premiumInputs.missingCheckoutDays > 0) {
      warnings.push({ code: "missing_checkout", message: `${plural(premiumInputs.missingCheckoutDays, "day")} ${premiumInputs.missingCheckoutDays === 1 ? "has" : "have"} no check-out, so no hours count for ${premiumInputs.missingCheckoutDays === 1 ? "it" : "them"}. Fix the attendance, then recompute.`, blocking: false });
    }
    if (premiumInputs.withoutDayResult > 0) {
      warnings.push({ code: "day_result_missing", message: `${plural(premiumInputs.withoutDayResult, "day")} worked ${premiumInputs.withoutDayResult === 1 ? "has" : "have"} no measured hours yet, so no overtime, holiday or night pay for ${premiumInputs.withoutDayResult === 1 ? "it" : "them"}. Recalculate that attendance, then recompute.`, blocking: false });
    }
    if (premiumInputs.regularHolidaysAbsentBefore > 0) {
      warnings.push({
        code: "holiday_absent_before",
        message: `Absent the workday before ${plural(premiumInputs.regularHolidaysAbsentBefore, "regular holiday")}. ${rateType === "daily" ? "Not paid for it." : "Still paid in basic pay; deduct it with an adjustment if your policy requires."}`,
        blocking: false,
      });
    }
  }
  const restDaysWorked = attendance.restDaysWorked ?? 0;
  if (restDaysWorked > 0 && !premiumInputs) {
    const { restDayMultiplier } = payPremiumsOf(policy);
    warnings.push({
      code: "rest_day_work",
      message: `Worked ${plural(restDaysWorked, "rest day")}. Add rest day pay as an adjustment (${formatMultiplierPercent(restDayMultiplier)} of the daily rate is ${formatMoney(dailyRate * restDayMultiplier)} a day).`,
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
