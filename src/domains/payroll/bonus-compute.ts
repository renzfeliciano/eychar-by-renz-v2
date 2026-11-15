// Computing a bonus run (e.g. a Christmas bonus): each current employee's amount from the run's own
// settings, with HR's per-employee amounts applied, then the records and totals replaced in one
// transaction, the same way the 13th-month run writes.
import { Types } from "mongoose";
import { withTransaction } from "@/server/db/transaction";
import { PayrollPolicyModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { CompensationService } from "./compensation-service";
import { NotFoundError } from "@/shared/errors";
import { formatPersonName } from "@/lib/person-name";
import { dateToDateKey } from "@/lib/date-key";
import { formatMoney } from "@/lib/money";
import { roundMoney, sumMoney } from "./engine/money";
import { monthlyBasicFor } from "./engine/compute-pay";
import { bonusAmount, monthsServedInYear, serviceMonths, type BonusBasis } from "./engine/bonus";
import type { PayWarning } from "./engine/compute-pay";
import { projectsAsOf } from "./payroll-scope";
import { rosterInputsFor } from "./payroll-run-compute";

type Run = InstanceType<typeof PayrollRunModel>;
type BonusRecord = Record<string, unknown> & { employeeName: string; grossPay: number; netPay: number; warnings: PayWarning[] };
type Settings = { label: string; basis: BonusBasis; value: number; prorate: boolean; minServiceMonths: number; overrides: { employeeId: Types.ObjectId; amount: number }[] };

const PAID = ["approved", "released"];

export async function computeBonusRun(run: Run) {
  const organizationId = run.organizationId.toString();
  const settings = run.bonus as unknown as Settings;
  const year = run.payPeriodStart.getUTCFullYear();
  const payDate = dateToDateKey(run.payDate);

  const [policy, { roster, isCurrentStaff, employments }, otherBonusRuns] = await Promise.all([
    PayrollPolicyModel.findById(run.policyId).lean(),
    rosterInputsFor(organizationId),
    PayrollRunModel.find({ organizationId: run.organizationId, runType: "bonus", status: { $in: PAID }, payPeriodStart: run.payPeriodStart, _id: { $ne: run._id } })
      .select("_id runNumber bonus.label")
      .lean(),
  ]);
  if (!policy) throw new NotFoundError("This run's policy no longer exists");

  // Who is employed on the pay date, and since when without a break (for service months and proration).
  const employmentsByEmployee = new Map<string, typeof employments>();
  for (const employment of employments) {
    const key = employment.employeeId.toString();
    employmentsByEmployee.set(key, [...(employmentsByEmployee.get(key) ?? []), employment]);
  }
  const serviceStartOn = (employeeId: string, date: string): string | null => {
    const rows = (employmentsByEmployee.get(employeeId) ?? []).filter((row) => dateToDateKey(row.effectiveFrom) <= date);
    const current = rows.at(-1);
    if (!current || (current.effectiveTo && dateToDateKey(current.effectiveTo) < date) || !isCurrentStaff(current.status)) return null;
    let start = dateToDateKey(current.effectiveFrom);
    for (let index = rows.length - 2; index >= 0 && isCurrentStaff(rows[index].status); index--) start = dateToDateKey(rows[index].effectiveFrom);
    return start;
  };

  const projectByEmployee = await projectsAsOf(roster.map((row) => row._id.toString()), payDate);
  let candidates = roster.filter((row) => serviceStartOn(row._id.toString(), payDate) !== null);
  if (run.projectId) candidates = candidates.filter((row) => projectByEmployee.get(row._id.toString()) === run.projectId!.toString());

  const [termsByEmployee, alreadyPaid] = await Promise.all([
    CompensationService.getAsOfForEmployees(candidates.map((row) => row._id.toString()), organizationId, payDate),
    otherBonusRuns.length
      ? PayrollRecordModel.find({ payrollRunId: { $in: otherBonusRuns.map((other) => other._id) }, employeeId: { $in: candidates.map((row) => row._id) } })
          .select("payrollRunId employeeId netPay")
          .lean()
      : Promise.resolve([]),
  ]);
  const runNumberById = new Map(otherBonusRuns.map((other) => [other._id.toString(), other.runNumber]));
  const paidByEmployee = new Map<string, { amount: number; runs: string[] }>();
  for (const record of alreadyPaid) {
    const key = record.employeeId.toString();
    const entry = paidByEmployee.get(key) ?? { amount: 0, runs: [] };
    entry.amount = roundMoney(entry.amount + record.netPay);
    entry.runs.push(runNumberById.get(record.payrollRunId.toString()) ?? "");
    paidByEmployee.set(key, entry);
  }
  const overrideByEmployee = new Map((settings.overrides ?? []).map((override) => [override.employeeId.toString(), override.amount]));

  const exclusions: { employeeId: Types.ObjectId; employeeName: string; reason: string }[] = [];
  const out: BonusRecord[] = [];
  for (const employee of candidates) {
    const employeeId = employee._id.toString();
    const employeeName = formatPersonName(employee.person);
    const override = overrideByEmployee.get(employeeId);
    if (override === 0) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: "Left out by HR" });
      continue;
    }
    const serviceStart = serviceStartOn(employeeId, payDate)!;
    const months = serviceMonths(serviceStart, payDate);
    if (override === undefined && months < settings.minServiceMonths) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: `${months} months of service; this bonus needs ${settings.minServiceMonths}` });
      continue;
    }
    const terms = termsByEmployee.get(employeeId);
    if (!terms && override === undefined && settings.basis !== "fixed") {
      exclusions.push({ employeeId: employee._id, employeeName, reason: "No pay terms on the pay date" });
      continue;
    }

    const rateType = (terms?.rateType ?? "monthly") as "monthly" | "daily";
    const rate = terms?.rate ?? 0;
    const monthlyBasic = monthlyBasicFor(rateType, rate, policy.workDaysPerYear);
    const dailyRate = rateType === "monthly" ? roundMoney((rate * 12) / policy.workDaysPerYear) : rate;
    const monthsServed = settings.prorate ? monthsServedInYear(year, serviceStart) : undefined;
    const computed = bonusAmount({ basis: settings.basis, value: settings.value, monthlyBasic, dailyRate, prorateMonths: monthsServed });
    const amount = override ?? computed;
    if (amount <= 0) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: "The bonus works out to nothing" });
      continue;
    }

    const warnings: PayWarning[] = [];
    const paid = paidByEmployee.get(employeeId);
    if (paid) {
      warnings.push({ code: "bonus_already_paid", message: `Already paid ${formatMoney(paid.amount)} in another bonus run this year (${paid.runs.join(", ")}).`, blocking: false });
    }

    const project = projectByEmployee.get(employeeId) ?? null;
    out.push({
      payrollRunId: run._id,
      organizationId: run.organizationId,
      employeeId: employee._id,
      employeeNumber: employee.employeeNumber,
      employeeName,
      projectId: project ? new Types.ObjectId(project) : undefined,
      compensationId: terms?._id,
      rateType,
      rate,
      monthlyBasic,
      dailyRate,
      hourlyRate: policy.hoursPerDay ? roundMoney(dailyRate / policy.hoursPerDay) : 0,
      attendance: {},
      // Not taxed in the run: with 13th-month pay it is exempt up to the year's benefits cap, and the
      // year-end adjustment taxes any excess (the "bonus" code is in the capped Form 2316 box).
      earnings: [{ code: "bonus", label: settings.label, amount, taxable: false }],
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
      bonus: { year, basis: settings.basis, value: settings.value, monthlyBasic, dailyRate, prorated: settings.prorate, monthsServed, serviceStart, computed, overridden: override !== undefined },
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
