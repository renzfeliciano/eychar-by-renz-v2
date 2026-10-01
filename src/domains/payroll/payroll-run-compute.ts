// Recomputing a draft run: gather the inputs, compute every employee's pay
// in memory, then replace the records and totals in one transaction.
import { Types } from "mongoose";
import { withTransaction } from "@/server/db/transaction";
import {
  AttendancePolicyModel,
  AttendanceRecordModel,
  CompensationModel,
  EmploymentModel,
  PayrollAdjustmentModel,
  PayrollPolicyModel,
  PayrollRecordModel,
  PayrollRuleVersionModel,
  PayrollRunModel,
} from "@/server/db/models";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate, dateKeysBetween, dateToDateKey, formatDateKey } from "@/lib/date-key";
import { computeEmployeePay, type PayAdjustment, type PayWarning } from "./engine/compute-pay";
import { isLastCutoffOfMonth, type PayFrequency } from "./engine/pay-frequency";
import { sumMoney } from "./engine/money";
import { summarizeAttendance } from "./payroll-attendance";
import { projectsAsOf } from "./payroll-scope";
import { CompensationService } from "./compensation-service";

/** A net pay change bigger than this against the last released payroll is flagged for review. */
const NET_PAY_CHANGE_THRESHOLD = 0.2;

const peso = (value: number) => `₱${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toObjectId = (id?: string | null) => (id ? new Types.ObjectId(id) : undefined);

/**
 * Computes every record of a draft run from current inputs and replaces
 * what was there. Everything is gathered in a handful of queries, computed
 * in memory, then written (ADR-014's compute-then-persist rule).
 */
export async function computeRun(runId: Types.ObjectId) {
  const run = await PayrollRunModel.findById(runId);
  if (!run) throw new NotFoundError("Payroll run not found");
  const organizationId = run.organizationId.toString();
  const start = dateToDateKey(run.payPeriodStart);
  const end = dateToDateKey(run.payPeriodEnd);
  const periodDays = dateKeysBetween(start, end);

  const [policy, rules, roster, isCurrentStaff] = await Promise.all([
    PayrollPolicyModel.findById(run.policyId).lean(),
    PayrollRuleVersionModel.findById(run.ruleVersionId).lean(),
    EmployeeService.listWithCurrentStatus(organizationId),
    loadCurrentStaffCheck(organizationId),
  ]);
  if (!policy || !rules) throw new NotFoundError("This run's policy or rule version no longer exists");
  const payFrequency = policy.payFrequency as PayFrequency;
  const taxTable = rules.taxTables.find((table: { payFrequency: string }) => table.payFrequency === payFrequency);
  if (!taxTable) throw new BusinessRuleError(`Rule version v${rules.versionNumber} has no ${payFrequency} withholding tax table.`);

  // Who was employed on which days of the period.
  const rosterIds = roster.map((row) => row._id.toString());
  const employments = await EmploymentModel.find({ employeeId: { $in: rosterIds.map((id) => new Types.ObjectId(id)) } })
    .sort({ effectiveFrom: 1 })
    .lean();
  const employmentsByEmployee = new Map<string, typeof employments>();
  for (const employment of employments) {
    const key = employment.employeeId.toString();
    employmentsByEmployee.set(key, [...(employmentsByEmployee.get(key) ?? []), employment]);
  }
  const eligibilityOf = (employeeId: string) => {
    const rows = employmentsByEmployee.get(employeeId) ?? [];
    return (date: string) => {
      let status: string | undefined;
      for (const row of rows) {
        if (dateToDateKey(row.effectiveFrom) <= date && (!row.effectiveTo || dateToDateKey(row.effectiveTo) >= date)) status = row.status;
      }
      return status !== undefined && isCurrentStaff(status);
    };
  };

  let candidates = roster.filter((row) => periodDays.some(eligibilityOf(row._id.toString())));
  const projectByEmployee = await projectsAsOf(candidates.map((row) => row._id.toString()), end);
  if (run.projectId) candidates = candidates.filter((row) => projectByEmployee.get(row._id.toString()) === run.projectId!.toString());
  const candidateIds = candidates.map((row) => row._id.toString());
  const candidateObjectIds = candidateIds.map((id) => new Types.ObjectId(id));

  const [termsByEmployee, termChanges, attendance, adjustments, priorRuns] = await Promise.all([
    CompensationService.getAsOfForEmployees(candidateIds, organizationId, end),
    CompensationModel.find({ organizationId: run.organizationId, employeeId: { $in: candidateObjectIds }, effectiveFrom: { $gt: dateKeyToDate(start), $lte: dateKeyToDate(end) } }).lean(),
    AttendanceRecordModel.find({ organizationId: run.organizationId, employeeId: { $in: candidateObjectIds }, date: { $gte: dateKeyToDate(start), $lte: dateKeyToDate(end) } })
      .select("employeeId date status checkInAt checkOutAt policyId")
      .lean(),
    PayrollAdjustmentModel.find({ payrollRunId: run._id }).lean(),
    PayrollRunModel.find({ organizationId: run.organizationId, _id: { $ne: run._id }, status: { $in: ["approved", "released"] }, payPeriodEnd: { $lt: dateKeyToDate(start) } })
      .sort({ payPeriodEnd: -1 })
      .limit(12)
      .select("_id")
      .lean(),
  ]);

  const attendancePolicies = await AttendancePolicyModel.find({ _id: { $in: [...new Set(attendance.map((record) => record.policyId?.toString()).filter(Boolean))] } }).lean();
  const attendancePolicyById = new Map(attendancePolicies.map((item) => [item._id.toString(), item]));
  const attendanceByEmployee = new Map<string, typeof attendance>();
  for (const record of attendance) {
    const key = record.employeeId.toString();
    attendanceByEmployee.set(key, [...(attendanceByEmployee.get(key) ?? []), record]);
  }
  const adjustmentsByEmployee = new Map<string, PayAdjustment[]>();
  for (const adjustment of adjustments) {
    const key = adjustment.employeeId.toString();
    adjustmentsByEmployee.set(key, [
      ...(adjustmentsByEmployee.get(key) ?? []),
      { category: adjustment.category, label: adjustment.label, direction: adjustment.direction as "earning" | "deduction", amount: adjustment.amount, taxable: adjustment.taxable },
    ]);
  }
  const termChangeByEmployee = new Map(termChanges.map((row) => [row.employeeId.toString(), dateToDateKey(row.effectiveFrom)]));

  // The most recent approved or released net pay per employee, for the variance check.
  const priorRunOrder = new Map(priorRuns.map((prior, index) => [prior._id.toString(), index]));
  const priorRecords = priorRuns.length
    ? await PayrollRecordModel.find({ payrollRunId: { $in: priorRuns.map((prior) => prior._id) }, employeeId: { $in: candidateObjectIds } }).select("payrollRunId employeeId netPay").lean()
    : [];
  const previousNetByEmployee = new Map<string, { order: number; netPay: number }>();
  for (const record of priorRecords) {
    const order = priorRunOrder.get(record.payrollRunId.toString())!;
    const existing = previousNetByEmployee.get(record.employeeId.toString());
    if (!existing || order < existing.order) previousNetByEmployee.set(record.employeeId.toString(), { order, netPay: record.netPay });
  }

  const lastCutoff = isLastCutoffOfMonth(payFrequency, end);
  const exclusions: { employeeId: Types.ObjectId; employeeName: string; reason: string }[] = [];
  const records = [];

  for (const employee of candidates) {
    const employeeId = employee._id.toString();
    const employeeName = formatPersonName(employee.person);
    const terms = termsByEmployee.get(employeeId);
    if (!terms) {
      exclusions.push({ employeeId: employee._id, employeeName, reason: `No pay terms on ${formatDateKey(end)}` });
      continue;
    }

    const summary = summarizeAttendance({
      periodDays,
      workWeekDays: policy.workWeekDays,
      isEligible: eligibilityOf(employeeId),
      records: (attendanceByEmployee.get(employeeId) ?? []).map((record) => {
        const attendancePolicy = record.policyId ? attendancePolicyById.get(record.policyId.toString()) : undefined;
        return {
          date: dateToDateKey(record.date),
          status: record.status,
          checkInAt: record.checkInAt,
          checkOutAt: record.checkOutAt,
          policy: attendancePolicy ? { standardStartTime: attendancePolicy.standardStartTime, standardEndTime: attendancePolicy.standardEndTime } : null,
        };
      }),
    });

    const pay = computeEmployeePay({
      compensation: {
        rateType: terms.rateType as "monthly" | "daily",
        rate: terms.rate,
        allowances: terms.allowances.map((allowance: { name: string; amount: number; basis: string; taxable: boolean }) => ({
          name: allowance.name,
          amount: allowance.amount,
          basis: allowance.basis as "monthly" | "daily",
          taxable: allowance.taxable,
        })),
        minimumWageEarner: terms.minimumWageEarner,
      },
      policy: {
        payFrequency,
        workDaysPerYear: policy.workDaysPerYear,
        hoursPerDay: policy.hoursPerDay,
        deductLateAndUndertime: policy.deductLateAndUndertime,
        contributionTiming: policy.contributionTiming as "every_cutoff" | "last_cutoff_of_month",
      },
      rules: { taxTable: taxTable.brackets, contributions: rules.contributions },
      attendance: summary,
      adjustments: adjustmentsByEmployee.get(employeeId) ?? [],
      isLastCutoffOfMonth: lastCutoff,
    });

    const warnings: PayWarning[] = [...pay.warnings];
    const changedOn = termChangeByEmployee.get(employeeId);
    if (changedOn) {
      warnings.push({
        code: "pay_terms_changed",
        message: `Pay terms changed on ${formatDateKey(changedOn)}, within this period; the new terms are used. Add a salary adjustment if the days before need the old rate.`,
        blocking: false,
      });
    }
    const previous = previousNetByEmployee.get(employeeId)?.netPay;
    if (previous !== undefined && previous > 0) {
      const change = (pay.netPay - previous) / previous;
      if (Math.abs(change) > NET_PAY_CHANGE_THRESHOLD) {
        warnings.push({
          code: "net_pay_change",
          message: `Net pay is ${change > 0 ? "up" : "down"} ${Math.round(Math.abs(change) * 100)}% from the last payroll (${peso(previous)}).`,
          blocking: false,
        });
      }
    }

    records.push({
      payrollRunId: run._id,
      organizationId: run.organizationId,
      employeeId: employee._id,
      employeeNumber: employee.employeeNumber,
      employeeName,
      projectId: toObjectId(projectByEmployee.get(employeeId)),
      compensationId: terms._id,
      rateType: pay.rateType,
      rate: pay.rate,
      monthlyBasic: pay.monthlyBasic,
      dailyRate: pay.dailyRate,
      hourlyRate: pay.hourlyRate,
      attendance: summary,
      earnings: pay.earnings,
      contributions: pay.contributions,
      deductions: pay.deductions,
      grossPay: pay.grossPay,
      taxableIncome: pay.taxableIncome,
      tax: pay.tax,
      employeeContributions: pay.employeeContributions,
      employerContributions: pay.employerContributions,
      totalDeductions: pay.totalDeductions,
      netPay: pay.netPay,
      previousNetPay: previous,
      warnings,
    });
  }

  records.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  exclusions.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  run.set({
    payFrequency,
    exclusions,
    totals: {
      employees: records.length,
      grossPay: sumMoney(records.map((record) => record.grossPay)),
      employeeContributions: sumMoney(records.map((record) => record.employeeContributions)),
      employerContributions: sumMoney(records.map((record) => record.employerContributions)),
      tax: sumMoney(records.map((record) => record.tax)),
      otherDeductions: sumMoney(records.flatMap((record) => record.deductions.map((line) => line.amount))),
      netPay: sumMoney(records.map((record) => record.netPay)),
    },
    blockingIssues: records.filter((record) => record.warnings.some((warning) => warning.blocking)).length,
    warningCount: records.filter((record) => record.warnings.length > 0).length,
    computedAt: new Date(),
  });
  // Replacing the records and the run's totals is one change: a failure part
  // way can't leave a run with no records, or totals that don't match them (ADR-041).
  const computed = records; // fixes the array's inferred type before the closure reads it
  await withTransaction(async (session) => {
    await PayrollRecordModel.deleteMany({ payrollRunId: run._id }, { session });
    if (computed.length) await PayrollRecordModel.insertMany(computed, { session });
    await run.save({ session });
  });
  return run;
}
