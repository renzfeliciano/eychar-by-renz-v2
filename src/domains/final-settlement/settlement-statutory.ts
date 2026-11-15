// Contributions and tax on final pay (payroll plan Phase 5, Gate D §3), with the payroll engine's own
// functions: the month's contributions by computeMonthlyContributionExact and the year's tax by the Phase 4
// annualization, extended with this settlement's lines. No copies of the math.
import { Types } from "mongoose";
import { PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { dateKeyToDate } from "@/lib/date-key";
import { formatMoney } from "@/lib/money";
import { computeMonthlyContributionExact, type ContributionRule } from "@/domains/payroll/engine/contributions";
import { monthlyBasicFor } from "@/domains/payroll/engine/compute-pay";
import { roundMoney, sumMoney } from "@/domains/payroll/engine/money";
import type { YearLine } from "@/domains/payroll/engine/year-end-tax";
import { annualizeEmployeeYear, employeeYears, yearEndRulesOf, type EmployeeYear } from "@/domains/payroll/year-end-data";
import type { SettlementLine, SettlementStatutory } from "./settlement-calculator";

/** How a settlement line reads as a pay line for the Form 2316 box map. */
const YEAR_LINE_CODE: Partial<Record<SettlementLine["code"], string>> = {
  salary_balance: "basic",
  leave_encashment: "leave_encashment",
  thirteenth_month: "thirteenth_month",
  manual: "manual",
};

type RuleVersion = { contributions?: ContributionRule[] | null } & Parameters<typeof yearEndRulesOf>[0];

export async function settlementStatutory(input: {
  organizationId: Types.ObjectId;
  employeeId: Types.ObjectId;
  lastWorkingDay: string;
  rateType: "monthly" | "daily";
  rate: number;
  workDaysPerYear: number;
  minimumWageEarner: boolean;
  ruleVersion: RuleVersion | null;
  /** The settlement's earning lines before contributions and tax. */
  lines: SettlementLine[];
}): Promise<SettlementStatutory & { annualization: ReturnType<typeof annualizeEmployeeYear>["annualization"] | null }> {
  const month = input.lastWorkingDay.slice(0, 7);
  const year = Number(input.lastWorkingDay.slice(0, 4));

  // The month's employee share, less what regular payroll already deducted that month [verify the base for a partial last month].
  const monthRuns = await PayrollRunModel.find({
    organizationId: input.organizationId,
    runType: { $in: [null, "regular"] },
    status: { $in: ["approved", "released"] },
    payPeriodEnd: { $gte: dateKeyToDate(`${month}-01`), $lte: dateKeyToDate(input.lastWorkingDay) },
  })
    .select("_id")
    .lean();
  const monthRecords = monthRuns.length
    ? await PayrollRecordModel.find({ payrollRunId: { $in: monthRuns.map((run) => run._id) }, employeeId: input.employeeId }).select("contributions").lean()
    : [];
  const deducted = new Map<string, number[]>();
  for (const record of monthRecords) for (const line of record.contributions ?? []) deducted.set(line.code, [...(deducted.get(line.code) ?? []), line.employee]);

  const monthlyBasic = monthlyBasicFor(input.rateType, input.rate, input.workDaysPerYear);
  const contributions = (input.ruleVersion?.contributions ?? []).map((rule) => {
    const monthly = computeMonthlyContributionExact(rule, monthlyBasic);
    const already = sumMoney(deducted.get(rule.code) ?? []);
    const employee = Math.max(0, roundMoney(roundMoney(monthly.employee) - already));
    const share = monthly.employee > 0 ? employee / monthly.employee : 0;
    return {
      code: rule.code,
      name: rule.name,
      employee,
      employer: Math.max(0, roundMoney(monthly.employer * share)),
      extra: Math.max(0, roundMoney(monthly.extra * share)),
      basis: `${month}: ${formatMoney(roundMoney(monthly.employee))} for the month on ${formatMoney(monthlyBasic)} basic, less ${formatMoney(already)} already deducted`,
    };
  });

  // The year's tax, with this settlement's taxable lines and contributions added in.
  const rules = input.ruleVersion ? yearEndRulesOf(input.ruleVersion) : null;
  if (!rules) {
    return { contributions, taxDifference: 0, taxBasis: "Not trued up: the rule version has no annual tax table. Add a new rule version with one.", annualization: null };
  }
  const years = await employeeYears(input.organizationId, year, [input.employeeId]);
  const own: EmployeeYear = years.get(input.employeeId.toString()) ?? {
    employeeId: input.employeeId.toString(),
    lines: [],
    contributions: [],
    presentWithheld: 0,
    minimumWageEarner: false,
    periodFrom: "",
    periodTo: "",
    sourceRunIds: [],
    previous: { ids: [], taxable: 0, withheld: 0, employers: [] },
  };
  const extraLines: YearLine[] = input.lines
    .filter((line) => line.direction === "earning" && YEAR_LINE_CODE[line.code])
    .map((line) => ({ code: YEAR_LINE_CODE[line.code]!, amount: line.amount, taxable: line.taxable ?? true, minimumWage: input.minimumWageEarner }));
  const extraContributions = contributions.filter((line) => line.employee > 0).map((line) => ({ amount: line.employee, minimumWage: input.minimumWageEarner }));
  const { annualization } = annualizeEmployeeYear({ ...own, lines: [...own.lines, ...extraLines], contributions: [...own.contributions, ...extraContributions] }, rules);
  const taxBasis = `Tax due for ${year} ${formatMoney(annualization.taxDue)} on ${formatMoney(annualization.grossTaxable)} taxable${annualization.previousTaxable ? ` (incl. ${formatMoney(annualization.previousTaxable)} from a previous employer)` : ""}, less ${formatMoney(annualization.withheld)} withheld`;
  return { contributions, taxDifference: annualization.difference, taxBasis, annualization };
}
