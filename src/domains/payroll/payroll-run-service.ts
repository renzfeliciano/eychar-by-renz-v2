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
import { dateKeyToDate, dateToDateKey, formatDateKey } from "@/lib/date-key";
import { runTypeOf } from "./payroll-labels";
import { basicEarnedFrom, thirteenthMonthDueDate } from "./engine/thirteenth-month";
import { payPremiumsOf } from "./engine/premiums";
import { finalSettlementsInYear, paidRegularRunsInYear, thirteenthMonthPaid } from "./thirteenth-month-ledger";
import { formatMoney } from "@/lib/money";
import { roundMoney } from "./engine/money";
import { PayrollPolicyService } from "./payroll-policy-service";
import { PayrollRuleVersionService } from "./payroll-rule-version-service";
import type { CreatePayrollRunInput, CreateThirteenthMonthRunInput, PayrollAdjustmentInput, PayrollRunActionInput } from "@/shared/validation/payroll";

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
 * Computes a run just created as a draft, or removes it if anything fails. `recheck` runs first: two
 * prepares at the same moment (or a manual one racing the schedule) both pass the first overlap check,
 * and the one created later gives way.
 */
async function computeNewRunOrRemove(runId: Types.ObjectId, recheck: () => Promise<void>) {
  try {
    await recheck();
    await withComputeLock(runId, () => computeRun(runId));
  } catch (error) {
    await withTransaction(async (session) => {
      await PayrollRecordModel.deleteMany({ payrollRunId: runId }, { session });
      await PayrollRunModel.deleteOne({ _id: runId }, { session });
    });
    throw error;
  }
}

/**
 * For a draft: the policy or rule version that would apply if it were prepared today, when that is
 * not the one it was computed with (for example a corrected rule version added since). The draft
 * keeps its snapshot (recompute uses the stored ids); this only lets HR see it and decide whether
 * to cancel and prepare it again. Released and other non-draft runs never get a notice.
 */
async function newerVersionsFor(run: { status: string; organizationId: Types.ObjectId; projectId?: Types.ObjectId | null; payPeriodEnd: Date; payDate: Date; policyId: Types.ObjectId; ruleVersionId: Types.ObjectId }) {
  if (run.status !== "draft") return {};
  const scope = { organizationId: run.organizationId.toString(), projectId: run.projectId?.toString() };
  const [policyResult, ruleResult] = await Promise.all([
    PayrollPolicyService.resolve({ ...scope, effectiveDate: run.payPeriodEnd }),
    PayrollRuleVersionService.resolve({ ...scope, effectiveDate: run.payDate }),
  ]);
  const policy = policyResult && !policyResult.policy._id.equals(run.policyId) ? { id: policyResult.policy._id.toString(), name: policyResult.policy.name as string } : undefined;
  const ruleVersion =
    ruleResult && !ruleResult.policy._id.equals(run.ruleVersionId)
      ? { id: ruleResult.policy._id.toString(), name: ruleResult.policy.name as string, versionNumber: ruleResult.policy.versionNumber as number }
      : undefined;
  return { ...(policy ? { policy } : {}), ...(ruleVersion ? { ruleVersion } : {}) };
}

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
      runType: "regular",
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

    await computeNewRunOrRemove(run._id, () => assertNoOverlap(input.organizationId, input.projectId, input.payPeriodStart, input.payPeriodEnd, run._id));

    const prepared = await PayrollRunModel.findById(run._id).lean();
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.prepared",
      resourceType: "PayrollRun",
      resourceId: run._id.toString(),
      after: { runNumber: prepared!.runNumber, payPeriodStart: input.payPeriodStart, payPeriodEnd: input.payPeriodEnd, payDate: input.payDate, projectId: input.projectId, totals: prepared!.totals },
      metadata: { source: options.source?.type ?? "manual", scheduleId: options.source?.scheduleId, runType: "regular" },
    });
    return prepared!;
  },

  /**
   * Prepares the 13th-month run for a calendar year (payroll plan Phase 3, PD 851): every employee's basic
   * pay earned that year divided by the policy's divisor, from approved and released regular runs, with the
   * rest of December estimated. One per year per scope (the run-type overlap rule). The policy is the one in
   * force on Dec 31; a pay date after the policy's deadline (default Dec 24) is allowed but noted.
   */
  async prepareThirteenthMonth(input: CreateThirteenthMonthRunInput, actor: Actor) {
    await connectMongoDB();
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");
    const start = `${input.year}-01-01`;
    const end = `${input.year}-12-31`;

    const policyResult = await PayrollPolicyService.resolve({ organizationId: input.organizationId, projectId: input.projectId, effectiveDate: dateKeyToDate(end) });
    if (!policyResult) throw new NotFoundError(`No payroll policy applies on ${formatDateKey(end)}. Add one under Payroll › Policies.`);
    // A 13th-month run withholds nothing, but every run records the rule version in force on its pay date.
    const ruleResult = await PayrollRuleVersionService.resolve({ organizationId: input.organizationId, projectId: input.projectId, effectiveDate: dateKeyToDate(input.payDate) });
    if (!ruleResult) throw new NotFoundError("No payroll rule version applies on the pay date. Add one under Payroll › Rule versions.");

    const kind = { runType: "thirteenth_month" as const };
    await assertNoOverlap(input.organizationId, input.projectId, start, end, undefined, kind);
    const dueBy = thirteenthMonthDueDate(policyResult.policy, input.year);
    const lateNote = input.payDate > dueBy ? `Pay date is after the ${formatDateKey(dueBy)} deadline in the policy (PD 851).` : undefined;

    const now = new Date();
    const run = await PayrollRunModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      runNumber: await nextRunNumber(input.organizationId, input.payDate),
      projectId: toObjectId(input.projectId),
      runType: "thirteenth_month",
      payFrequency: policyResult.policy.payFrequency,
      payPeriodStart: dateKeyToDate(start),
      payPeriodEnd: dateKeyToDate(end),
      payDate: dateKeyToDate(input.payDate),
      policyId: policyResult.policy._id,
      ruleVersionId: ruleResult.policy._id,
      status: "draft",
      source: { type: "manual" },
      preparedBy: toObjectId(actor.userId),
      history: [{ action: "prepared", status: "draft", at: now, by: toObjectId(actor.userId), note: lateNote }],
    });
    await computeNewRunOrRemove(run._id, () => assertNoOverlap(input.organizationId, input.projectId, start, end, run._id, kind));

    const prepared = await PayrollRunModel.findById(run._id).lean();
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.prepared",
      resourceType: "PayrollRun",
      resourceId: run._id.toString(),
      after: { runNumber: prepared!.runNumber, year: input.year, payDate: input.payDate, projectId: input.projectId, totals: prepared!.totals },
      metadata: { source: "manual", runType: "thirteenth_month", lateNote },
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
        // Not a block: HR may knowingly leave someone out, but must say why for each (checked after the recompute above).
        const given = new Map((input.action === "submit" ? (input.exclusionReasons ?? []) : []).map((entry) => [entry.employeeId, entry.reason.trim()]));
        const exclusions = fresh.exclusions as { employeeId: Types.ObjectId; employeeName: string; reason: string }[];
        const unexplained = exclusions.filter((exclusion) => !given.get(exclusion.employeeId.toString()));
        if (unexplained.length) {
          throw new BusinessRuleError(`Give a reason for each employee this run leaves out before submitting: ${unexplained.map((exclusion) => exclusion.employeeName).join(", ")}.`);
        }
        const acknowledgements = exclusions.map((exclusion) => ({
          employeeId: exclusion.employeeId,
          employeeName: exclusion.employeeName,
          computedReason: exclusion.reason,
          reason: given.get(exclusion.employeeId.toString())!,
          at: now,
          by,
        }));
        if (acknowledgements.length) {
          const summary = `Left out: ${acknowledgements.map((entry) => `${entry.employeeName}: ${entry.reason}`).join("; ")}`;
          note = [note, summary].filter(Boolean).join(" · ");
          metadata.exclusions = acknowledgements.map((entry) => ({ employeeId: entry.employeeId.toString(), employeeName: entry.employeeName, computedReason: entry.computedReason, reason: entry.reason }));
        }
        return applyTransition({ computeLock: lock }, { submittedBy: by, submittedAt: now, exclusionAcknowledgements: acknowledgements }, { computeLock: 1, computeLockUntil: 1 });
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

  /**
   * The January true-up of last year's 13th month (owner decision 2026-11-14): once every regular run of
   * `year` is approved or released, each employee in this draft gets the difference between what they are
   * owed (basic actually earned ÷ the divisor) and what was paid for the year, as a 13th-month adjustment:
   * an earning (non-taxable) if underpaid, a deduction if the December estimate overpaid. HR reviews it
   * with the rest of the run. Running it again adds nothing for employees who already have one.
   */
  async addThirteenthMonthTrueUp(runId: string, input: { organizationId: string; year: number }, actor: Actor) {
    await connectMongoDB();
    const run = await findRun(runId, input.organizationId);
    if (run.status !== "draft") throw new BusinessRuleError("The true-up can only be added while the run is a draft.");
    if (runTypeOf(run) !== "regular") throw new BusinessRuleError("The true-up goes on a regular payroll run.");
    if (dateToDateKey(run.payPeriodStart) <= `${input.year}-12-31`) throw new BusinessRuleError(`Add the ${input.year} true-up to a payroll after ${input.year}.`);

    const organizationId = run.organizationId;
    const yearStart = dateKeyToDate(`${input.year}-01-01`);
    const yearEnd = dateKeyToDate(`${input.year}-12-31`);
    const unfinished = await PayrollRunModel.find({ organizationId, runType: { $in: [null, "regular"] }, status: { $in: ["draft", "submitted"] }, payPeriodEnd: { $gte: yearStart, $lte: yearEnd } })
      .select("runNumber")
      .lean();
    if (unfinished.length) throw new BusinessRuleError(`Approve or cancel ${input.year}'s remaining payroll first: ${unfinished.map((other) => other.runNumber).join(", ")}.`);
    const thirteenthRun = await PayrollRunModel.findOne({ organizationId, runType: "thirteenth_month", status: { $in: ["approved", "released"] }, payPeriodStart: yearStart }).select("policyId").lean();
    if (!thirteenthRun) throw new BusinessRuleError(`There's no approved 13th-month run for ${input.year} to true up.`);
    const { thirteenthMonthDivisor: divisor } = payPremiumsOf(await PayrollPolicyModel.findById(thirteenthRun.policyId).lean());

    const inRun = await PayrollRecordModel.find({ payrollRunId: run._id }).select("employeeId employeeName").lean();
    const employeeIds = inRun.map((record) => record.employeeId as Types.ObjectId);
    const regularRuns = await paidRegularRunsInYear(organizationId, input.year);
    const [yearRecords, paid, existing, settled] = await Promise.all([
      PayrollRecordModel.find({ payrollRunId: { $in: regularRuns.map((regular) => regular._id) }, employeeId: { $in: employeeIds } }).select("employeeId earnings").lean(),
      thirteenthMonthPaid(organizationId, input.year, employeeIds),
      PayrollAdjustmentModel.find({ payrollRunId: run._id, category: "thirteenth_month", thirteenthMonthYear: input.year }).select("employeeId").lean(),
      finalSettlementsInYear(organizationId, input.year),
    ]);
    const alreadyAdded = new Set(existing.map((adjustment) => adjustment.employeeId.toString()));

    const lines = inRun.flatMap((record) => {
      const employeeId = record.employeeId.toString();
      // Already added, or the year's 13th month was settled in their final pay.
      if (alreadyAdded.has(employeeId) || settled.has(employeeId)) return [];
      const basicEarned = basicEarnedFrom(yearRecords.filter((row) => row.employeeId.toString() === employeeId).flatMap((row) => row.earnings ?? []));
      const owed = roundMoney(basicEarned / divisor - (paid.get(employeeId) ?? 0));
      if (Math.abs(owed) < 0.01) return [];
      return [{ employeeId: record.employeeId, employeeName: record.employeeName, basicEarned, paid: paid.get(employeeId) ?? 0, owed }];
    });

    const created = await withComputeLock(run._id, async () => {
      const docs = lines.length
        ? await PayrollAdjustmentModel.insertMany(
            lines.map((line) => ({
              payrollRunId: run._id,
              organizationId,
              employeeId: line.employeeId,
              category: "thirteenth_month",
              thirteenthMonthYear: input.year,
              label: line.owed > 0 ? `13th month ${input.year} true-up` : `13th month ${input.year} overpaid`,
              direction: line.owed > 0 ? "earning" : "deduction",
              amount: Math.abs(line.owed),
              taxable: false,
              notes: `${formatMoney(line.basicEarned)} basic earned in ${input.year} ÷ ${divisor} − ${formatMoney(line.paid)} paid`,
              createdBy: toObjectId(actor.userId),
            })),
          )
        : [];
      try {
        await computeRun(run._id);
      } catch (error) {
        // The run's records don't include these yet, so take them back out.
        await PayrollAdjustmentModel.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } });
        throw error;
      }
      return docs;
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-run.thirteenth-month-true-up",
      resourceType: "PayrollRun",
      resourceId: runId,
      after: { year: input.year, added: lines.map((line) => ({ employeeId: line.employeeId.toString(), employeeName: line.employeeName, amount: line.owed })) },
      metadata: { year: input.year, divisor, skippedAlreadyAdded: alreadyAdded.size },
    });
    return { added: created.length, underpaid: lines.filter((line) => line.owed > 0).length, overpaid: lines.filter((line) => line.owed < 0).length, alreadyAdded: alreadyAdded.size };
  },

  /** Adds an HR input (overtime, loan, …) to a draft run and recomputes it. */
  async addAdjustment(runId: string, input: PayrollAdjustmentInput, actor: Actor) {
    await connectMongoDB();
    const run = await findRun(runId, input.organizationId);
    if (run.status !== "draft") throw new BusinessRuleError("Adjustments can only change while the run is a draft. Return it to draft first.");
    if (runTypeOf(run) !== "regular") throw new BusinessRuleError("Adjustments go on a regular payroll run. This run's amounts come from its own calculation.");
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
      try {
        await computeRun(run._id);
      } catch (error) {
        // The run's records still reflect the inputs without this adjustment, so take it back out.
        await PayrollAdjustmentModel.deleteOne({ _id: created._id });
        throw error;
      }
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
      try {
        await computeRun(run._id);
      } catch (error) {
        // The run's records still include this adjustment, so put it back as it was.
        await PayrollAdjustmentModel.create(removed);
        throw error;
      }
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
    return { run: run.toObject(), records, adjustments, policy, ruleVersion, newerVersions: await newerVersionsFor(run) };
  },
};
