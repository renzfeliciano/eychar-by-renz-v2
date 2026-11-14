// Computing a 13th-month run (payroll plan Phase 3): gather the year's approved and released regular
// payroll, compute each employee's 13th month in memory, then replace the records and totals in one
// transaction, the same way computeRun does for a regular run.
import { Types } from "mongoose";
import { withTransaction } from "@/server/db/transaction";
import { CompensationModel, PayrollPolicyModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { finalSettlementsInYear, paidRegularRunsInYear, thirteenthMonthPaid } from "./thirteenth-month-ledger";
import { NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { addDays, dateKeyToDate, dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { formatMoney } from "@/lib/money";
import { sumMoney } from "./engine/money";
import { payPremiumsOf } from "./engine/premiums";
import { basicEarnedFrom, estimateRemainingBasic, thirteenthMonthAmount } from "./engine/thirteenth-month";
import type { PayFrequency } from "./engine/pay-frequency";
import type { PayWarning } from "./engine/compute-pay";
import { projectsAsOf } from "./payroll-scope";
import { rosterInputsFor } from "./payroll-run-compute";

type Run = InstanceType<typeof PayrollRunModel>;
type ThirteenthMonthRecord = Record<string, unknown> & { employeeName: string; grossPay: number; netPay: number; warnings: PayWarning[] };

export async function computeThirteenthMonthRun(run: Run) {
  const organizationId = run.organizationId.toString();
  const year = run.payPeriodStart.getUTCFullYear();
  const yearEnd = `${year}-12-31`;

  const [policy, { roster, isCurrentStaff, employments }, regularRuns] = await Promise.all([
    PayrollPolicyModel.findById(run.policyId).lean(),
    rosterInputsFor(organizationId),
    paidRegularRunsInYear(run.organizationId, year),
  ]);
  if (!policy) throw new NotFoundError("This run's policy no longer exists");
  const { thirteenthMonthDivisor: divisor } = payPremiumsOf(policy);
  const workWeekDays: number[] = policy.workWeekDays?.length ? policy.workWeekDays : [1, 2, 3, 4, 5];
  const regularRunIds = regularRuns.map((regular) => regular._id);

  const [records, paidByEmployee, settlementByEmployee] = await Promise.all([
    PayrollRecordModel.find({ payrollRunId: { $in: regularRunIds } })
      .select("payrollRunId employeeId earnings rateType rate monthlyBasic dailyRate hourlyRate compensationId")
      .lean(),
    thirteenthMonthPaid(run.organizationId, year),
    finalSettlementsInYear(run.organizationId, year),
  ]);

  const runEndById = new Map(regularRuns.map((regular) => [regular._id.toString(), dateToDateKey(regular.payPeriodEnd)]));
  const recordsByEmployee = new Map<string, typeof records>();
  for (const record of records) {
    const key = record.employeeId.toString();
    recordsByEmployee.set(key, [...(recordsByEmployee.get(key) ?? []), record]);
  }

  // Who is employed on which day (current staff only), as computeRun reads it.
  const employmentsByEmployee = new Map<string, typeof employments>();
  for (const employment of employments) {
    const key = employment.employeeId.toString();
    employmentsByEmployee.set(key, [...(employmentsByEmployee.get(key) ?? []), employment]);
  }
  const isEmployedOn = (employeeId: string) => (date: string) => {
    let status: string | undefined;
    for (const row of employmentsByEmployee.get(employeeId) ?? []) {
      if (dateToDateKey(row.effectiveFrom) <= date && (!row.effectiveTo || dateToDateKey(row.effectiveTo) >= date)) status = row.status;
    }
    return status !== undefined && isCurrentStaff(status);
  };

  // Everyone paid basic this year, plus anyone employed at year end who hasn't been paid yet (e.g. hired in December).
  const projectByEmployee = await projectsAsOf(roster.map((row) => row._id.toString()), yearEnd);
  let candidates = roster.filter((row) => recordsByEmployee.has(row._id.toString()) || isEmployedOn(row._id.toString())(yearEnd));
  if (run.projectId) candidates = candidates.filter((row) => projectByEmployee.get(row._id.toString()) === run.projectId!.toString());
  const termsAtYearEnd = new Map(
    (
      await CompensationModel.find({ organizationId: run.organizationId, employeeId: { $in: candidates.map((row) => row._id) }, effectiveFrom: { $lte: dateKeyToDate(yearEnd) } })
        .sort({ effectiveFrom: 1 })
        .lean()
    ).map((row) => [row.employeeId.toString(), row]),
  );

  const exclusions: { employeeId: Types.ObjectId; employeeName: string; reason: string }[] = [];
  const out: ThirteenthMonthRecord[] = [];
  for (const employee of candidates) {
    const employeeId = employee._id.toString();
    const employeeName = formatPersonName(employee.person);
    const settlement = settlementByEmployee.get(employeeId);
    if (settlement) {
      const lastDay = settlement.lastWorkingDay;
      exclusions.push({ employeeId: employee._id, employeeName, reason: `13th month is part of the final settlement (${settlement.status}${lastDay ? `, last day ${formatDateKey(lastDay)}` : ""})` });
      continue;
    }

    const own = recordsByEmployee.get(employeeId) ?? [];
    const basicEarned = basicEarnedFrom(own.flatMap((record) => record.earnings ?? []));
    // The rest of the year no approved regular run covered for this employee's scope: estimate it (true-up in January).
    const project = projectByEmployee.get(employeeId) ?? null;
    const coveredThrough = regularRuns
      .filter((regular) => !regular.projectId || regular.projectId.toString() === project)
      .map((regular) => dateToDateKey(regular.payPeriodEnd))
      .sort()
      .pop();
    const estimateFrom = coveredThrough ? addDays(coveredThrough, 1) : `${year}-01-01`;
    const terms = termsAtYearEnd.get(employeeId);
    const estimatedBasic =
      terms && estimateFrom <= yearEnd
        ? estimateRemainingBasic({
            rateType: terms.rateType as "monthly" | "daily",
            rate: terms.rate,
            payFrequency: policy.payFrequency as PayFrequency,
            workDaysPerYear: policy.workDaysPerYear,
            workWeekDays,
            from: estimateFrom,
            to: yearEnd,
            isEmployed: isEmployedOn(employeeId),
          })
        : 0;
    const alreadyPaid = paidByEmployee.get(employeeId) ?? 0;
    const amount = thirteenthMonthAmount({ basicEarned, estimatedBasic, divisor, alreadyPaid });
    if (amount <= 0) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: basicEarned + estimatedBasic <= 0 ? `No basic pay in ${year}` : `13th month for ${year} already paid (${formatMoney(alreadyPaid)})` });
      continue;
    }

    const warnings: PayWarning[] = [];
    if (estimatedBasic > 0) {
      warnings.push({
        code: "thirteenth_month_estimate",
        message: `Includes ${formatMoney(estimatedBasic)} of basic pay estimated for ${formatDateRange(estimateFrom, yearEnd)}, not yet in an approved payroll. The January true-up settles any difference.`,
        blocking: false,
      });
    }
    if (!terms && estimateFrom <= yearEnd && isEmployedOn(employeeId)(yearEnd)) {
      warnings.push({ code: "thirteenth_month_no_terms", message: `No pay terms on ${formatDateKey(yearEnd)}, so the rest of the year isn't estimated.`, blocking: false });
    }
    const latest = own.at(-1);
    const rateType = (latest?.rateType ?? terms?.rateType ?? "monthly") as "monthly" | "daily";
    const rate = latest?.rate ?? terms?.rate ?? 0;
    out.push({
      payrollRunId: run._id,
      organizationId: run.organizationId,
      employeeId: employee._id,
      employeeNumber: employee.employeeNumber,
      employeeName,
      projectId: project ? new Types.ObjectId(project) : undefined,
      compensationId: terms?._id ?? latest?.compensationId,
      rateType,
      rate,
      monthlyBasic: latest?.monthlyBasic ?? (rateType === "monthly" ? rate : 0),
      dailyRate: latest?.dailyRate ?? (rateType === "daily" ? rate : 0),
      hourlyRate: latest?.hourlyRate ?? 0,
      attendance: {},
      earnings: [{ code: "thirteenth_month", label: `13th month pay (${year})`, amount, taxable: false }],
      contributions: [],
      deductions: [],
      grossPay: amount,
      taxableIncome: 0,
      tax: 0,
      employeeContributions: 0,
      employerContributions: 0,
      totalDeductions: 0,
      netPay: amount,
      warnings,
      thirteenthMonth: {
        year,
        basicEarned,
        estimatedBasic,
        estimatedFrom: estimatedBasic > 0 ? estimateFrom : undefined,
        divisor,
        alreadyPaid,
        monthsWithPay: new Set(own.map((record) => runEndById.get(record.payrollRunId.toString())?.slice(0, 7))).size,
        sourceRunIds: [...new Set(own.map((record) => record.payrollRunId.toString()))].map((id) => new Types.ObjectId(id)),
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
      tax: 0,
      otherDeductions: 0,
      netPay: sumMoney(out.map((record) => record.netPay)),
    },
    blockingIssues: 0,
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
