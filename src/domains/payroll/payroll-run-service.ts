import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { withTransaction } from "@/server/db/transaction";
import {
  EmployeeModel,
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
import { dateKeyToDate } from "@/lib/date-key";
import { roundMoney } from "./engine/money";
import { PayrollPolicyService } from "./payroll-policy-service";
import { PayrollRuleVersionService } from "./payroll-rule-version-service";
import type { CreatePayrollRunInput, PayrollAdjustmentInput, PayrollRunActionInput } from "@/shared/validation/payroll";

import { NO_ACTIVE_LOCK, assertNoOverlap, findRun, nextRunNumber, withComputeLock } from "./payroll-run-guards";
import { computeRun } from "./payroll-run-compute";

type Actor = { userId?: string };
type RunSource = { type: "manual" | "schedule"; scheduleId?: string };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const toObjectId = (id?: string | null) => (id ? new Types.ObjectId(id) : undefined);

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
      // Two prepares at the same moment (or a manual one racing the schedule)
      // both pass the first check; the one created later gives way.
      await assertNoOverlap(input.organizationId, input.projectId, input.payPeriodStart, input.payPeriodEnd, run._id);
      await withComputeLock(run._id, () => computeRun(run._id));
    } catch (error) {
      await withTransaction(async (session) => {
        await PayrollRecordModel.deleteMany({ payrollRunId: run._id }, { session });
        await PayrollRunModel.deleteOne({ _id: run._id }, { session });
      });
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
      await withComputeLock(run._id, () => computeRun(run._id));
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

    const set: Record<string, unknown> = { status: transition.to };
    const unset: Record<string, 1> = {};
    if (input.action === "approve") {
      const preparedOrSubmittedByApprover = !!actor.userId && [run.preparedBy?.toString(), run.submittedBy?.toString()].includes(actor.userId);
      metadata.selfApproved = preparedOrSubmittedByApprover;
      Object.assign(set, { approvedBy: by, approvedAt: now });
      note = input.note;
    } else if (input.action === "return") {
      Object.assign(unset, { approvedBy: 1, approvedAt: 1 });
      note = input.reason;
    } else if (input.action === "release") {
      Object.assign(set, { releasedBy: by, releasedAt: now, releasedOn: dateKeyToDate(input.releasedOn), paymentReference: input.paymentReference });
      note = input.paymentReference ? `Payment reference ${input.paymentReference}` : undefined;
    } else if (input.action === "cancel") {
      Object.assign(set, { cancelledBy: by, cancelledAt: now, cancelReason: input.reason });
      note = input.reason;
    } else if (input.action === "submit") {
      note = input.note;
    }
    for (const key of Object.keys(set)) if (set[key] === undefined) delete set[key];

    /** The status change itself: only applies if the run is still in the status we checked. */
    const applyTransition = (extraFilter: Record<string, unknown>, extraSet: Record<string, unknown> = {}, extraUnset: Record<string, 1> = {}) =>
      PayrollRunModel.findOneAndUpdate(
        { _id: run._id, organizationId: run.organizationId, status: run.status, ...extraFilter },
        {
          $set: { ...set, ...extraSet },
          ...(Object.keys({ ...unset, ...extraUnset }).length ? { $unset: { ...unset, ...extraUnset } } : {}),
          $push: { history: { action: transition.past, status: transition.to, at: now, by, note } },
        },
        { new: true },
      );

    let updated;
    if (input.action === "submit") {
      // Submitting recomputes first, so what goes for approval reflects the
      // latest attendance; the lock keeps anything from changing in between.
      updated = await withComputeLock(run._id, async (lock) => {
        const fresh = await computeRun(run._id);
        if (fresh.totals!.employees === 0) throw new BusinessRuleError("There's no one to pay in this run.");
        if (fresh.blockingIssues > 0) {
          throw new BusinessRuleError(`${plural(fresh.blockingIssues, "employee")} ${fresh.blockingIssues === 1 ? "has" : "have"} a blocking issue. Fix it and recompute before submitting.`);
        }
        return applyTransition({ computeLock: lock }, { submittedBy: by, submittedAt: now }, { computeLock: 1, computeLockUntil: 1 });
      });
    } else {
      updated = await applyTransition(NO_ACTIVE_LOCK(now));
    }
    if (!updated) throw new ConflictError("Someone else changed this run at the same time. Reload it and try again.");

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: `payroll-run.${transition.past}`,
      resourceType: "PayrollRun",
      resourceId: runId,
      before,
      after: { status: updated.status },
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

    const adjustment = await withComputeLock(run._id, async () => {
      const created = await PayrollAdjustmentModel.create({
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
      return created;
    });

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
    const adjustment = await withComputeLock(run._id, async () => {
      const removed = await PayrollAdjustmentModel.findOneAndDelete({ _id: new Types.ObjectId(adjustmentId), payrollRunId: run._id }).lean();
      if (!removed) throw new NotFoundError("Adjustment not found in this run");
      await computeRun(run._id);
      return removed;
    });

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
      PayrollPolicyModel.findById(run.policyId).select("name payFrequency workDaysPerYear hoursPerDay contributionTiming overtimeMultiplier restDayMultiplier").lean(),
      PayrollRuleVersionModel.findById(run.ruleVersionId).select("name versionNumber contributions.name contributions.extraLabel").lean(),
    ]);
    return { run: run.toObject(), records, adjustments, policy, ruleVersion };
  },
};
