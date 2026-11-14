// Computing a year-end adjustment run (payroll plan Phase 4): annualize each employee's year, then
// replace the records and totals in one transaction, the same way the other run types do.
import { Types } from "mongoose";
import { withTransaction } from "@/server/db/transaction";
import { PayrollRecordModel, PayrollRuleVersionModel, PayrollRunModel } from "@/server/db/models";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { dateToDateKey, formatDateKey } from "@/lib/date-key";
import { formatMoney } from "@/lib/money";
import { sumMoney } from "./engine/money";
import type { PayWarning } from "./engine/compute-pay";
import { finalSettlementsInYear } from "./thirteenth-month-ledger";
import { annualizeEmployeeYear, employeeYears, yearEndRulesOf } from "./year-end-data";
import { projectsAsOf } from "./payroll-scope";
import { rosterInputsFor } from "./payroll-run-compute";

type Run = InstanceType<typeof PayrollRunModel>;
type YearEndRecord = Record<string, unknown> & { employeeName: string; grossPay: number; tax: number; netPay: number; warnings: PayWarning[] };

export const YEAR_END_MISSING_RULES = "This rule version has no annual tax table or Form 2316 box map. Add a new rule version with them first (Payroll › Rule versions).";

export async function computeYearEndRun(run: Run) {
  const organizationId = run.organizationId.toString();
  const year = run.payPeriodStart.getUTCFullYear();
  const yearEnd = `${year}-12-31`;

  const version = await PayrollRuleVersionModel.findById(run.ruleVersionId).lean();
  if (!version) throw new NotFoundError("This run's rule version no longer exists");
  const rules = yearEndRulesOf(version as Parameters<typeof yearEndRulesOf>[0]);
  if (!rules) throw new BusinessRuleError(YEAR_END_MISSING_RULES);

  const [{ roster, isCurrentStaff, employments }, years, settlementByEmployee] = await Promise.all([
    rosterInputsFor(organizationId),
    employeeYears(run.organizationId, year),
    finalSettlementsInYear(run.organizationId, year),
  ]);

  const employedOnYearEnd = new Set<string>();
  const statusByEmployee = new Map<string, string>();
  for (const row of employments) {
    if (dateToDateKey(row.effectiveFrom) <= yearEnd && (!row.effectiveTo || dateToDateKey(row.effectiveTo) >= yearEnd)) statusByEmployee.set(row.employeeId.toString(), row.status);
  }
  for (const [employeeId, status] of statusByEmployee) if (isCurrentStaff(status)) employedOnYearEnd.add(employeeId);

  const projectByEmployee = await projectsAsOf(roster.map((row) => row._id.toString()), yearEnd);
  let candidates = roster.filter((row) => years.get(row._id.toString())?.sourceRunIds.length);
  if (run.projectId) candidates = candidates.filter((row) => projectByEmployee.get(row._id.toString()) === run.projectId!.toString());

  const exclusions: { employeeId: Types.ObjectId; employeeName: string; reason: string }[] = [];
  const out: YearEndRecord[] = [];
  for (const employee of candidates) {
    const employeeId = employee._id.toString();
    const employeeName = formatPersonName(employee.person);
    const settlement = settlementByEmployee.get(employeeId);
    if (settlement) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: `Annualized in the final settlement (${settlement.status}${settlement.lastWorkingDay ? `, last day ${formatDateKey(settlement.lastWorkingDay)}` : ""})` });
      continue;
    }
    if (!employedOnYearEnd.has(employeeId)) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: `Not employed on ${formatDateKey(yearEnd)}: annualize in the final pay` });
      continue;
    }

    const own = years.get(employeeId)!;
    const { amounts, annualization } = annualizeEmployeeYear(own, rules);
    const difference = annualization.difference;
    const refund = difference < 0 ? -difference : 0;
    const collect = difference > 0 ? difference : 0;

    const warnings: PayWarning[] = [];
    if (collect > 0) {
      warnings.push({ code: "year_end_collect", message: `${formatMoney(collect)} more tax is due for ${year}. Deduct it from the employee's pay (balance by January 25 [verify]).`, blocking: false });
    }
    if (own.previous.ids.length) {
      warnings.push({ code: "year_end_two_employers", message: `Had ${own.previous.ids.length + 1} employers in ${year}: files their own return (not on the substituted-filing list).`, blocking: false });
    }
    if (amounts.benefitsExcess > 0) {
      warnings.push({ code: "year_end_benefits_excess", message: `13th month and other benefits are ${formatMoney(amounts.benefitsExcess)} over the exempt limit; the excess is taxed here.`, blocking: false });
    }
    if (amounts.unmapped.length) {
      warnings.push({ code: "year_end_unmapped", message: `Pay lines with no Form 2316 box (left out of the totals): ${amounts.unmapped.join(", ")}. Add them to the rule version's box map.`, blocking: true });
    }

    const earnings = refund > 0 ? [{ code: "year_end_tax_refund", label: `Tax refund ${year} (year-end)`, amount: refund, taxable: false }] : [];
    out.push({
      payrollRunId: run._id,
      organizationId: run.organizationId,
      employeeId: employee._id,
      employeeNumber: employee.employeeNumber,
      employeeName,
      projectId: projectByEmployee.get(employeeId) ? new Types.ObjectId(projectByEmployee.get(employeeId)!) : undefined,
      rateType: "monthly",
      rate: 0,
      monthlyBasic: 0,
      dailyRate: 0,
      hourlyRate: 0,
      attendance: {},
      earnings,
      contributions: [],
      deductions: [],
      grossPay: refund,
      taxableIncome: 0,
      tax: collect,
      employeeContributions: 0,
      employerContributions: 0,
      totalDeductions: collect,
      netPay: sumMoney([refund, -collect]),
      warnings,
      yearEnd: {
        year,
        periodFrom: own.periodFrom,
        periodTo: own.periodTo,
        minimumWageEarner: own.minimumWageEarner,
        ...annualization,
        benefitsExcess: amounts.benefitsExcess,
        gross: amounts.gross,
        nonTaxableTotal: amounts.nonTaxableTotal,
        taxableTotal: amounts.taxableTotal,
        boxes: Object.entries(amounts.boxes).map(([box, amount]) => ({ box, amount })),
        unmapped: amounts.unmapped,
        previousEmploymentIds: own.previous.ids.map((id) => new Types.ObjectId(id)),
        sourceRunIds: own.sourceRunIds.map((id) => new Types.ObjectId(id)),
      },
    });
  }

  out.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  exclusions.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  run.set({
    exclusions,
    totals: {
      employees: out.length,
      grossPay: sumMoney(out.map((record) => record.grossPay)),
      employeeContributions: 0,
      employerContributions: 0,
      tax: sumMoney(out.map((record) => record.tax)),
      otherDeductions: 0,
      netPay: sumMoney(out.map((record) => record.netPay)),
    },
    blockingIssues: out.filter((record) => record.warnings.some((warning) => warning.blocking)).length,
    warningCount: out.filter((record) => record.warnings.length > 0).length,
    computedAt: new Date(),
  });
  await withTransaction(async (session) => {
    await PayrollRecordModel.deleteMany({ payrollRunId: run._id }, { session });
    if (out.length) await PayrollRecordModel.insertMany(out, { session });
    await run.save({ session });
  });
  return run;
}
