// Final pay variance checks (ADR-032; payroll plan Phase 5, Gate D V1–V9). Pure: the service gathers the
// facts, this decides what fires. Severity per check is policy data (PayrollPolicy.finalPayChecks); these
// defaults apply to checks the policy doesn't set.
import { formatMoney } from "@/lib/money";
import { formatDateKey } from "@/lib/date-key";

export const FINAL_PAY_CHECK_CODES = [
  "negative_net",
  "leave_over_limit",
  "thirteenth_month",
  "thirteenth_month_pending",
  "recent_pay_change",
  "missing_government_ids",
  "tax_true_up",
  "employment_not_ended",
  "unfinished_payroll",
  "inputs_changed",
] as const;
export type FinalPayCheckCode = (typeof FINAL_PAY_CHECK_CODES)[number];
export type CheckSeverity = "blocking" | "warning" | "off";

export const FINAL_PAY_CHECK_DEFAULTS: Record<FinalPayCheckCode, Exclude<CheckSeverity, "off">> = {
  negative_net: "blocking",
  leave_over_limit: "warning",
  thirteenth_month: "warning",
  thirteenth_month_pending: "blocking",
  recent_pay_change: "warning",
  missing_government_ids: "warning",
  tax_true_up: "warning",
  employment_not_ended: "blocking",
  unfinished_payroll: "blocking",
  inputs_changed: "warning",
};
/** V4's window when the policy doesn't set `recentPayChangeDays`. */
export const RECENT_PAY_CHANGE_DAYS_DEFAULT = 60;

export type FinalPayFacts = {
  net: number;
  /** Leave days paid out as taxable because they are beyond the de minimis limit. */
  taxableLeaveDays: number;
  thirteenthMonthPaid: number;
  /** Run numbers of 13th-month runs for the year still draft or submitted. */
  thirteenthMonthPending: string[];
  /** The latest pay-terms change within the window before the last working day, if any. */
  recentPayChange: string | null;
  recentPayChangeDays: number;
  missingGovernmentIds: string[];
  taxDifference: number;
  /** Null when the employment matches; otherwise why it doesn't. */
  employmentProblem: string | null;
  /** Run numbers of draft or submitted regular runs covering any salary-balance day. */
  unfinishedRegularRuns: string[];
  /** Inputs that differ from a fresh read (checked once the settlement is approved). */
  inputsChanged: string[];
};

export type FinalPayCheck = { code: FinalPayCheckCode; severity: "blocking" | "warning"; message: string };

export function severitiesOf(policy: { finalPayChecks?: { code: string; severity: string }[] | null } | null | undefined): Record<FinalPayCheckCode, CheckSeverity> {
  const configured = new Map((policy?.finalPayChecks ?? []).map((check) => [check.code, check.severity as CheckSeverity]));
  return Object.fromEntries(FINAL_PAY_CHECK_CODES.map((code) => [code, configured.get(code) ?? FINAL_PAY_CHECK_DEFAULTS[code]])) as Record<FinalPayCheckCode, CheckSeverity>;
}

export function runFinalPayChecks(facts: FinalPayFacts, severities: Record<FinalPayCheckCode, CheckSeverity>): FinalPayCheck[] {
  const fired: { code: FinalPayCheckCode; message: string }[] = [];
  if (facts.net < 0) fired.push({ code: "negative_net", message: `Net final pay is ${formatMoney(facts.net)}: the deductions are more than the pay-out.` });
  if (facts.taxableLeaveDays > 0) fired.push({ code: "leave_over_limit", message: `${facts.taxableLeaveDays} leave day${facts.taxableLeaveDays === 1 ? "" : "s"} paid out beyond the de minimis limit are taxed.` });
  if (facts.thirteenthMonthPaid > 0) fired.push({ code: "thirteenth_month", message: `${formatMoney(facts.thirteenthMonthPaid)} of 13th month was already paid this year; only the rest is in this settlement.` });
  if (facts.thirteenthMonthPending.length) fired.push({ code: "thirteenth_month_pending", message: `13th-month run ${facts.thirteenthMonthPending.join(", ")} isn't approved yet: approve or cancel it first, or the 13th month could be paid twice.` });
  if (facts.recentPayChange) fired.push({ code: "recent_pay_change", message: `Pay terms changed on ${formatDateKey(facts.recentPayChange)}, within ${facts.recentPayChangeDays} days of the last working day. Check the rate used.` });
  if (facts.missingGovernmentIds.length) fired.push({ code: "missing_government_ids", message: `Missing on the employee's record: ${facts.missingGovernmentIds.join(", ")}.` });
  if (facts.taxDifference !== 0) {
    fired.push({ code: "tax_true_up", message: facts.taxDifference > 0 ? `${formatMoney(facts.taxDifference)} more tax is due for the year and is deducted here.` : `${formatMoney(-facts.taxDifference)} of tax was over-withheld this year and is refunded here.` });
  }
  if (facts.employmentProblem) fired.push({ code: "employment_not_ended", message: facts.employmentProblem });
  if (facts.unfinishedRegularRuns.length) fired.push({ code: "unfinished_payroll", message: `Payroll ${facts.unfinishedRegularRuns.join(", ")} covers days in this settlement and isn't approved yet. Approve it (it then pays those days) or cancel it, then recompute.` });
  if (facts.inputsChanged.length) fired.push({ code: "inputs_changed", message: `Records changed since approval: ${facts.inputsChanged.join(", ")}. The approved figures are kept; return it to draft to recompute.` });

  return fired.flatMap((check) => {
    const severity = severities[check.code];
    return severity === "off" ? [] : [{ ...check, severity }];
  });
}
