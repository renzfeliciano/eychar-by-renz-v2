// One year of an employee's pay, as the year-end annualization and the Form 2316 export read it
// (payroll plan Phase 4). Shared by the year-end run and the export so the two can't disagree.
import { Types } from "mongoose";
import { CompensationModel, PayrollAdjustmentModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { PriorEmploymentModel } from "@/server/db/models/prior-employment";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { paidRegularRunsInYear } from "./thirteenth-month-ledger";
import { annualizeTax, form2316Amounts, type Annualization, type Form2316Amounts, type Form2316Box, type YearLine } from "./engine/year-end-tax";
import { sumMoney } from "./engine/money";
import type { TaxBracket } from "./payroll-tax";

const PAID = ["approved", "released"];

export type YearEndRules = { annualTaxTable: TaxBracket[]; benefitsExemptionCap: number | null; form2316Boxes: Form2316Box[]; form2316Excluded: string[] };

export type EmployeeYear = {
  employeeId: string;
  lines: YearLine[];
  contributions: { amount: number; minimumWage: boolean }[];
  presentWithheld: number;
  minimumWageEarner: boolean;
  periodFrom: string;
  periodTo: string;
  sourceRunIds: string[];
  previous: { ids: string[]; taxable: number; withheld: number; employers: { name: string; tin?: string | null; address?: string | null; zipCode?: string | null; concurrent: boolean }[] };
};

/** Reads the year-end parts of a rule version, or null when it lacks the annual table or the Form 2316 box map. */
export function yearEndRulesOf(version: { annualTaxTable?: TaxBracket[] | null; benefitsExemptionCap?: number | null; form2316Boxes?: Form2316Box[] | null; form2316Excluded?: string[] | null }): YearEndRules | null {
  if (!version.annualTaxTable?.length || !version.form2316Boxes?.length) return null;
  return {
    annualTaxTable: version.annualTaxTable,
    benefitsExemptionCap: version.benefitsExemptionCap ?? null,
    form2316Boxes: version.form2316Boxes ?? [],
    form2316Excluded: version.form2316Excluded ?? [],
  };
}

/**
 * Every employee's pay lines for `year` from approved or released runs:
 * - regular runs whose period ends in the year (earnings, employee contributions, tax withheld);
 * - the year's 13th-month run;
 * - 13th-month true-ups follow the year they are for (`thirteenthMonthYear`, Gate C Q4), not the run they sit in.
 * Previous-employer entries for the year are attached. `employeeIds` narrows the read.
 */
export async function employeeYears(organizationId: Types.ObjectId, year: number, employeeIds?: Types.ObjectId[]): Promise<Map<string, EmployeeYear>> {
  const employeeFilter = employeeIds ? { employeeId: { $in: employeeIds } } : {};
  const [regularRuns, thirteenthRuns] = await Promise.all([
    paidRegularRunsInYear(organizationId, year),
    PayrollRunModel.find({ organizationId, runType: "thirteenth_month", status: { $in: PAID }, payPeriodStart: dateKeyToDate(`${year}-01-01`) }).select("_id payPeriodStart payPeriodEnd").lean(),
  ]);
  const regularIds = regularRuns.map((run) => run._id);
  const runById = new Map([...regularRuns, ...thirteenthRuns].map((run) => [run._id.toString(), run]));

  const [records, tagged, previous] = await Promise.all([
    PayrollRecordModel.find({ payrollRunId: { $in: [...regularIds, ...thirteenthRuns.map((run) => run._id)] }, ...employeeFilter })
      .select("payrollRunId employeeId compensationId earnings employeeContributions tax")
      .lean(),
    PayrollAdjustmentModel.find({ organizationId, category: "thirteenth_month", thirteenthMonthYear: { $ne: null }, ...employeeFilter })
      .select("payrollRunId employeeId direction amount thirteenthMonthYear")
      .lean(),
    PriorEmploymentModel.find({ organizationId, year, ...employeeFilter }).sort({ periodFrom: 1, createdAt: 1 }).lean(),
  ]);

  // Minimum-wage status of each record, from the pay terms it was computed with.
  const compensationIds = [...new Set(records.map((record) => record.compensationId?.toString()).filter(Boolean))] as string[];
  const minimumWageTerms = new Set(
    compensationIds.length
      ? (await CompensationModel.find({ _id: { $in: compensationIds.map((id) => new Types.ObjectId(id)) }, minimumWageEarner: true }).select("_id").lean()).map((row) => row._id.toString())
      : [],
  );

  // True-ups count only once their own run is approved or released.
  const taggedRunIds = [...new Set(tagged.map((adjustment) => adjustment.payrollRunId.toString()))];
  const paidTaggedRuns = new Set(
    taggedRunIds.length
      ? (await PayrollRunModel.find({ _id: { $in: taggedRunIds.map((id) => new Types.ObjectId(id)) }, status: { $in: PAID } }).select("_id").lean()).map((run) => run._id.toString())
      : [],
  );
  const regularIdSet = new Set(regularIds.map((id) => id.toString()));

  const years = new Map<string, EmployeeYear>();
  const entry = (employeeId: string) => {
    let found = years.get(employeeId);
    if (!found) {
      found = { employeeId, lines: [], contributions: [], presentWithheld: 0, minimumWageEarner: false, periodFrom: "", periodTo: "", sourceRunIds: [], previous: { ids: [], taxable: 0, withheld: 0, employers: [] } };
      years.set(employeeId, found);
    }
    return found;
  };
  const withheld = new Map<string, number[]>();

  for (const record of records) {
    const employeeId = record.employeeId.toString();
    const own = entry(employeeId);
    const run = runById.get(record.payrollRunId.toString())!;
    const minimumWage = !!record.compensationId && minimumWageTerms.has(record.compensationId.toString());
    if (minimumWage) own.minimumWageEarner = true;
    for (const line of record.earnings ?? []) own.lines.push({ code: line.code, amount: line.amount, taxable: line.taxable, minimumWage });
    if (record.employeeContributions) own.contributions.push({ amount: record.employeeContributions, minimumWage });
    withheld.set(employeeId, [...(withheld.get(employeeId) ?? []), record.tax ?? 0]);
    own.sourceRunIds.push(record.payrollRunId.toString());
    const from = dateToDateKey(run.payPeriodStart);
    const to = dateToDateKey(run.payPeriodEnd);
    if (regularIdSet.has(record.payrollRunId.toString())) {
      if (!own.periodFrom || from < own.periodFrom) own.periodFrom = from < `${year}-01-01` ? `${year}-01-01` : from;
      if (!own.periodTo || to > own.periodTo) own.periodTo = to;
    }
  }

  for (const adjustment of tagged) {
    const runId = adjustment.payrollRunId.toString();
    const employeeId = adjustment.employeeId.toString();
    const signed = adjustment.direction === "deduction" ? -adjustment.amount : adjustment.amount;
    // A true-up for another year sitting in this year's regular run: its earning line was read above, take it out.
    if (regularIdSet.has(runId) && adjustment.thirteenthMonthYear !== year && adjustment.direction === "earning") {
      entry(employeeId).lines.push({ code: "thirteenth_month", amount: -adjustment.amount, taxable: false, minimumWage: false });
    }
    // A true-up for this year, wherever it was paid: count it here (unless its earning line was already read).
    if (adjustment.thirteenthMonthYear === year && paidTaggedRuns.has(runId) && !(regularIdSet.has(runId) && adjustment.direction === "earning")) {
      entry(employeeId).lines.push({ code: "thirteenth_month", amount: signed, taxable: false, minimumWage: false });
    }
  }

  for (const row of previous) {
    const own = entry(row.employeeId.toString());
    own.previous.ids.push(row._id.toString());
    own.previous.taxable = sumMoney([own.previous.taxable, row.taxableCompensation]);
    own.previous.withheld = sumMoney([own.previous.withheld, row.taxWithheld ?? 0]);
    own.previous.employers.push({ name: row.employerName, tin: row.employerTin, address: row.employerAddress, zipCode: row.employerZipCode, concurrent: !!row.concurrent });
  }

  for (const [employeeId, own] of years) {
    own.presentWithheld = sumMoney(withheld.get(employeeId) ?? []);
    own.sourceRunIds = [...new Set(own.sourceRunIds)];
  }
  return years;
}

export type EmployeeYearResult = { amounts: Form2316Amounts; annualization: Annualization };

/** The Form 2316 amounts and the annualization for one employee's year. */
export function annualizeEmployeeYear(own: EmployeeYear, rules: YearEndRules): EmployeeYearResult {
  const amounts = form2316Amounts({ lines: own.lines, contributions: own.contributions, boxes: rules.form2316Boxes, excludedCodes: rules.form2316Excluded, benefitsCap: rules.benefitsExemptionCap });
  const annualization = annualizeTax({
    presentTaxable: amounts.taxableTotal,
    previousTaxable: own.previous.taxable,
    presentWithheld: own.presentWithheld,
    previousWithheld: own.previous.withheld,
    annualTable: rules.annualTaxTable,
  });
  return { amounts, annualization };
}
