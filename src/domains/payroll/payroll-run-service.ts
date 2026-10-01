import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  AttendancePolicyModel,
  AttendanceRecordModel,
  CompensationModel,
  EmployeeModel,
  EmploymentModel,
  PayrollAdjustmentModel,
  PayrollPolicyModel,
  PayrollRecordModel,
  PayrollRuleVersionModel,
  PayrollRunModel,
  ProjectModel,
} from "@/server/db/models";
import { assertOptionalInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate, dateKeysBetween, dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { computeEmployeePay, type PayAdjustment, type PayWarning } from "./engine/compute-pay";
import { isLastCutoffOfMonth, type PayFrequency } from "./engine/pay-frequency";
import { roundMoney, sumMoney } from "./engine/money";
import { summarizeAttendance } from "./payroll-attendance";
import { projectsAsOf } from "./payroll-scope";
import { CompensationService } from "./compensation-service";
import { PayrollPolicyService } from "./payroll-policy-service";
import { PayrollRuleVersionService } from "./payroll-rule-version-service";
import type { CreatePayrollRunInput, PayrollAdjustmentInput, PayrollRunActionInput } from "@/shared/validation/payroll";

type Actor = { userId?: string };
type RunSource = { type: "manual" | "schedule"; scheduleId?: string };

/** A net pay change bigger than this against the last released payroll is flagged for review. */
const NET_PAY_CHANGE_THRESHOLD = 0.2;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const peso = (value: number) => `₱${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toObjectId = (id?: string | null) => (id ? new Types.ObjectId(id) : undefined);

async function findRun(runId: string, organizationId: string) {
  if (!Types.ObjectId.isValid(runId)) throw new NotFoundError("Payroll run not found in this organization");
  const run = await PayrollRunModel.findOne({ _id: new Types.ObjectId(runId), organizationId: new Types.ObjectId(organizationId) });
  if (!run) throw new NotFoundError("Payroll run not found in this organization");
  return run;
}

async function nextRunNumber(organizationId: string, payDate: string): Promise<string> {
  const prefix = `PR-${payDate.slice(0, 4)}-`;
  const latest = await PayrollRunModel.findOne({ organizationId: new Types.ObjectId(organizationId), runNumber: { $regex: `^${prefix}` } })
    .sort({ runNumber: -1 })
    .select("runNumber")
    .lean();
  const next = latest ? Number(String(latest.runNumber).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * The same people can't be paid twice for the same day: an organization-wide
 * run conflicts with any other run over overlapping dates, and a project run
 * conflicts with organization-wide runs and runs for the same project.
 * Cancelled runs don't count.
 */
async function assertNoOverlap(organizationId: string, projectId: string | undefined, start: string, end: string) {
  const overlapping = await PayrollRunModel.find({
    organizationId: new Types.ObjectId(organizationId),
    status: { $ne: "cancelled" },
    payPeriodStart: { $lte: dateKeyToDate(end) },
    payPeriodEnd: { $gte: dateKeyToDate(start) },
  }).lean();
  const conflict = overlapping.find((run) => !projectId || !run.projectId || run.projectId.toString() === projectId);
  if (conflict) {
    throw new ConflictError(
      `${conflict.runNumber} already covers ${formatDateRange(dateToDateKey(conflict.payPeriodStart), dateToDateKey(conflict.payPeriodEnd))} for these employees. Cancel it first to prepare another.`,
    );
  }
}

/**
 * Computes every record of a draft run from current inputs and replaces
 * what was there. Everything is gathered in a handful of queries, computed
 * in memory, then written (ADR-014's compute-then-persist rule).
 */
async function computeRun(runId: Types.ObjectId) {
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

  await PayrollRecordModel.deleteMany({ payrollRunId: run._id });
  if (records.length) await PayrollRecordModel.insertMany(records);

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
  await run.save();
  return run;
}

const TRANSITIONS: Record<Exclude<PayrollRunActionInput["action"], "recompute">, { from: string[]; to: string; past: string; error: string }> = {
  submit: { from: ["draft"], to: "submitted", past: "submitted", error: "Only a draft run can be submitted." },
  approve: { from: ["submitted"], to: "approved", past: "approved", error: "Only a submitted run can be approved." },
  return: { from: ["submitted", "approved"], to: "draft", past: "returned", error: "Only a submitted or approved run can be returned." },
  release: { from: ["approved"], to: "released", past: "released", error: "Only an approved run can be released." },
  cancel: { from: ["draft", "submitted"], to: "cancelled", past: "cancelled", error: "Only a draft or submitted run can be cancelled. Return an approved run first; correct a released one in the next payroll." },
};

/**
 * Payroll runs (ADR-029): prepared as a draft for a scope (organization or
 * project) and period, recomputed freely while a draft, then submitted,
 * approved (or returned with a reason) and released. Every step is kept in
 * the run's history and the audit log; nothing is ever deleted.
 */
export const PayrollRunService = {
  async prepare(input: CreatePayrollRunInput, actor: Actor, options: { source?: RunSource } = {}) {
    await connectMongoDB();
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");

    const policyResult = await PayrollPolicyService.resolve({ organizationId: input.organizationId, projectId: input.projectId, effectiveDate: dateKeyToDate(input.payPeriodEnd) });
    if (!policyResult) throw new NotFoundError("No payroll policy applies to this period. Add one under Payroll › Policies.");
    // Tax and contribution rates follow the pay date, as withholding does.
    const ruleResult = await PayrollRuleVersionService.resolve({ organizationId: input.organizationId, projectId: input.projectId, effectiveDate: dateKeyToDate(input.payDate) });
    if (!ruleResult) throw new NotFoundError("No payroll rule version applies on the pay date. Add one under Payroll › Rule versions.");
    const payFrequency = policyResult.policy.payFrequency as string;
    if (!ruleResult.policy.taxTables.some((table: { payFrequency: string }) => table.payFrequency === payFrequency)) {
      throw new BusinessRuleError(`Rule version v${ruleResult.policy.versionNumber} has no ${payFrequency} withholding tax table.`);
    }

    await assertNoOverlap(input.organizationId, input.projectId, input.payPeriodStart, input.payPeriodEnd);

    const now = new Date();
    const run = await PayrollRunModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      runNumber: await nextRunNumber(input.organizationId, input.payDate),
      projectId: toObjectId(input.projectId),
      payFrequency,
      payPeriodStart: dateKeyToDate(input.payPeriodStart),
      payPeriodEnd: dateKeyToDate(input.payPeriodEnd),
      payDate: dateKeyToDate(input.payDate),
      policyId: policyResult.policy._id,
      ruleVersionId: ruleResult.policy._id,
      status: "draft",
      source: { type: options.source?.type ?? "manual", scheduleId: toObjectId(options.source?.scheduleId) },
      preparedBy: toObjectId(actor.userId),
      history: [{ action: "prepared", status: "draft", at: now, by: toObjectId(actor.userId), note: options.source?.type === "schedule" ? "Prepared automatically from the payroll schedule" : undefined }],
    });

    try {
      await computeRun(run._id);
    } catch (error) {
      await PayrollRecordModel.deleteMany({ payrollRunId: run._id });
      await PayrollRunModel.deleteOne({ _id: run._id });
      throw error;
    }

    const prepared = await PayrollRunModel.findById(run._id).lean();
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.prepared",
      resourceType: "PayrollRun",
      resourceId: run._id.toString(),
      after: { runNumber: prepared!.runNumber, payPeriodStart: input.payPeriodStart, payPeriodEnd: input.payPeriodEnd, payDate: input.payDate, projectId: input.projectId, totals: prepared!.totals },
      metadata: { source: options.source?.type ?? "manual", scheduleId: options.source?.scheduleId },
    });
    return prepared!;
  },

  async act(runId: string, input: PayrollRunActionInput, actor: Actor) {
    await connectMongoDB();
    const run = await findRun(runId, input.organizationId);
    const before = { status: run.status };
    const now = new Date();
    const by = toObjectId(actor.userId);
    let note: string | undefined;
    const metadata: Record<string, unknown> = {};

    if (input.action === "recompute") {
      if (run.status !== "draft") throw new BusinessRuleError("Only a draft run can be recomputed.");
      await computeRun(run._id);
      await PayrollRunModel.updateOne({ _id: run._id }, { $push: { history: { action: "recomputed", status: "draft", at: now, by } } });
      const recomputed = await PayrollRunModel.findById(run._id).lean();
      await AuditService.record({
        organizationId: input.organizationId,
        actorUserId: actor.userId,
        action: "payroll-run.recomputed",
        resourceType: "PayrollRun",
        resourceId: runId,
        after: { totals: recomputed!.totals },
      });
      return recomputed!;
    }

    const transition = TRANSITIONS[input.action];
    if (!transition.from.includes(run.status)) throw new BusinessRuleError(transition.error);

    if (input.action === "submit") {
      // Submitting recomputes first, so what goes for approval reflects the latest attendance.
      const fresh = await computeRun(run._id);
      if (fresh.totals!.employees === 0) throw new BusinessRuleError("There's no one to pay in this run.");
      if (fresh.blockingIssues > 0) {
        throw new BusinessRuleError(`${plural(fresh.blockingIssues, "employee")} ${fresh.blockingIssues === 1 ? "has" : "have"} a blocking issue. Fix it and recompute before submitting.`);
      }
      run.set({ totals: fresh.totals, exclusions: fresh.exclusions, blockingIssues: fresh.blockingIssues, warningCount: fresh.warningCount, computedAt: fresh.computedAt });
      run.set({ submittedBy: by, submittedAt: now });
      note = input.note;
    } else if (input.action === "approve") {
      const preparedOrSubmittedByApprover = !!actor.userId && [run.preparedBy?.toString(), run.submittedBy?.toString()].includes(actor.userId);
      metadata.selfApproved = preparedOrSubmittedByApprover;
      run.set({ approvedBy: by, approvedAt: now });
      note = input.note;
    } else if (input.action === "return") {
      run.set({ approvedBy: undefined, approvedAt: undefined });
      note = input.reason;
    } else if (input.action === "release") {
      run.set({ releasedBy: by, releasedAt: now, releasedOn: dateKeyToDate(input.releasedOn), paymentReference: input.paymentReference });
      note = input.paymentReference ? `Payment reference ${input.paymentReference}` : undefined;
    } else if (input.action === "cancel") {
      run.set({ cancelledBy: by, cancelledAt: now, cancelReason: input.reason });
      note = input.reason;
    }

    run.status = transition.to;
    run.history.push({ action: transition.past, status: transition.to, at: now, by, note });
    await run.save();

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: `payroll-run.${transition.past}`,
      resourceType: "PayrollRun",
      resourceId: runId,
      before,
      after: { status: run.status },
      metadata: { ...metadata, note },
    });

    return (await PayrollRunModel.findById(run._id).lean())!;
  },

  /** Adds an HR input (overtime, loan, …) to a draft run and recomputes it. */
  async addAdjustment(runId: string, input: PayrollAdjustmentInput, actor: Actor) {
    await connectMongoDB();
    const run = await findRun(runId, input.organizationId);
    if (run.status !== "draft") throw new BusinessRuleError("Adjustments can only change while the run is a draft. Return it to draft first.");
    if (!Types.ObjectId.isValid(input.employeeId) || !(await EmployeeModel.exists({ _id: input.employeeId, organizationId: run.organizationId }))) {
      throw new NotFoundError("Employee not found in this organization");
    }

    const adjustment = await PayrollAdjustmentModel.create({
      payrollRunId: run._id,
      organizationId: run.organizationId,
      employeeId: new Types.ObjectId(input.employeeId),
      category: input.category,
      label: input.label,
      direction: input.direction,
      amount: roundMoney(input.amount),
      taxable: input.direction === "earning" ? input.taxable : false,
      notes: input.notes,
      createdBy: toObjectId(actor.userId),
    });
    await computeRun(run._id);

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-adjustment.added",
      resourceType: "PayrollRun",
      resourceId: runId,
      after: { employeeId: input.employeeId, category: adjustment.category, label: adjustment.label, direction: adjustment.direction, amount: adjustment.amount, taxable: adjustment.taxable },
    });
    return adjustment;
  },

  async removeAdjustment(runId: string, adjustmentId: string, organizationId: string, actor: Actor) {
    await connectMongoDB();
    const run = await findRun(runId, organizationId);
    if (run.status !== "draft") throw new BusinessRuleError("Adjustments can only change while the run is a draft. Return it to draft first.");
    if (!Types.ObjectId.isValid(adjustmentId)) throw new NotFoundError("Adjustment not found in this run");
    // A draft's inputs, not a record of anything paid: removing one is a
    // plain delete, kept in the audit log with everything it said.
    const adjustment = await PayrollAdjustmentModel.findOneAndDelete({ _id: new Types.ObjectId(adjustmentId), payrollRunId: run._id }).lean();
    if (!adjustment) throw new NotFoundError("Adjustment not found in this run");
    await computeRun(run._id);

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "payroll-adjustment.removed",
      resourceType: "PayrollRun",
      resourceId: runId,
      before: { employeeId: adjustment.employeeId, category: adjustment.category, label: adjustment.label, direction: adjustment.direction, amount: adjustment.amount },
    });
  },

  async list(organizationId: string) {
    await connectMongoDB();
    return PayrollRunModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ payPeriodStart: -1, runNumber: -1 }).lean();
  },

  async getDetail(runId: string, organizationId: string) {
    await connectMongoDB();
    const run = await findRun(runId, organizationId);
    const [records, adjustments, policy, ruleVersion] = await Promise.all([
      PayrollRecordModel.find({ payrollRunId: run._id }).sort({ employeeName: 1 }).lean(),
      PayrollAdjustmentModel.find({ payrollRunId: run._id }).sort({ createdAt: 1 }).lean(),
      PayrollPolicyModel.findById(run.policyId).select("name payFrequency workDaysPerYear hoursPerDay contributionTiming").lean(),
      PayrollRuleVersionModel.findById(run.ruleVersionId).select("name versionNumber").lean(),
    ]);
    return { run: run.toObject(), records, adjustments, policy, ruleVersion };
  },
};
