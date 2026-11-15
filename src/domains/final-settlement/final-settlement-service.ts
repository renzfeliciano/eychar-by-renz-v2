import mongoose, { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { withTransaction, type ClientSession } from "@/server/db/transaction";
import {
  ClearanceCaseModel,
  CompensationModel,
  EmployeeDocumentModel,
  EmployeeModel,
  EmploymentModel,
  FinalSettlementModel,
  LeaveTypeModel,
  PayrollPolicyModel,
  PayrollRecordModel,
  PayrollRunModel,
  PersonModel,
  SeparationTypeModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { PaymentMethodService } from "@/domains/catalog/payment-method-service";
import { addDays, dateKeyToDate, dateToDateKey, formatDateKey } from "@/lib/date-key";
import { formatPersonName } from "@/lib/person-name";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import type { FinalSettlementActionInput, ManualLineInput } from "@/shared/validation/final-settlement";
import { computeSettlement, type ManualLine, type SettlementLine } from "./settlement-calculator";
import { accountabilityDrift, describeDrift } from "./settlement-accountabilities";
import { settlementStatutory } from "./settlement-statutory";
import { settlementHash } from "./settlement-hash";
import { RECENT_PAY_CHANGE_DAYS_DEFAULT, runFinalPayChecks, severitiesOf, type FinalPayCheck } from "./final-pay-checks";
import { employmentStatusForSeparation } from "./separation-status";
import { payPremiumsOf } from "@/domains/payroll/engine/premiums";
import { basicEarnedFrom } from "@/domains/payroll/engine/thirteenth-month";
import { roundMoney, sumMoney } from "@/domains/payroll/engine/money";
import { monthlyBasicFor } from "@/domains/payroll/engine/compute-pay";
import { thirteenthMonthPaid } from "@/domains/payroll/thirteenth-month-ledger";
import { assertNoOverlap, nextRunNumber } from "@/domains/payroll/payroll-run-guards";

type Actor = { userId?: string };

const EDITABLE = ["draft"];
/** Actions that move a settlement toward release. */
const FORWARD_ACTIONS: string[] = ["submit", "review", "approve", "disburse"];

const toObjectId = (id?: string) => (id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined);

async function requireSettlement(id: string, organizationId: string) {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Final settlement not found in this organization");
  const settlement = await FinalSettlementModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
  if (!settlement) throw new NotFoundError("Final settlement not found in this organization");
  return settlement;
}

const CHANGED_ELSEWHERE = "This settlement was just changed by someone else. Reload and try again.";

/**
 * Saves edits to a settlement that was checked to be a draft, only if it is
 * still one: a submit (or anything else) that landed in between makes this
 * a ConflictError instead of rewriting lines on a settlement already moving
 * through approval.
 */
async function saveWhileDraft(settlement: InstanceType<typeof FinalSettlementModel>) {
  if (!settlement.isNew) settlement.$where = { status: { $in: EDITABLE } };
  try {
    await settlement.save();
  } catch (error) {
    // No longer a draft (DocumentNotFoundError), or its lines changed since
    // it was read (VersionError): either way someone else got there first.
    if (error instanceof mongoose.Error.DocumentNotFoundError || error instanceof mongoose.Error.VersionError) throw new ConflictError(CHANGED_ELSEWHERE);
    throw error;
  }
}

/** Everything the calculator needs, read from the system of record as of the last working day. */
async function gatherInputs(organizationId: string, employeeId: string, lastWorkingDay: string) {
  const orgObjectId = new Types.ObjectId(organizationId);
  const employeeObjectId = new Types.ObjectId(employeeId);
  const year = Number(lastWorkingDay.slice(0, 4));

  const [terms, assignment] = await Promise.all([
    CompensationService.getAsOf(employeeId, organizationId, lastWorkingDay),
    EmployeeAssignmentService.getAsOf(employeeId, dateKeyToDate(lastWorkingDay)),
  ]);
  if (!terms) throw new BusinessRuleError(`No pay terms on the last working day. Add them in Payroll › Compensation first.`);
  const projectId = assignment?.projectId?.toString();
  const [resolved, ruleResolved] = await Promise.all([
    PayrollPolicyService.resolve({ organizationId, projectId, effectiveDate: dateKeyToDate(lastWorkingDay) }),
    PayrollRuleVersionService.resolve({ organizationId, projectId, effectiveDate: dateKeyToDate(lastWorkingDay) }),
  ]);
  const policy = resolved?.policy;
  if (!policy) throw new BusinessRuleError("No payroll policy applies on the last working day. Add one in Payroll › Policies first.");

  // Regular payroll already approved or released this year, up to the last day. (Runs saved before run
  // types existed have none and are regular; 13th-month and other run types are counted below.)
  const runs = await PayrollRunModel.find({
    organizationId: orgObjectId,
    runType: { $in: [null, "regular"] },
    status: { $in: ["approved", "released"] },
    payPeriodEnd: { $gte: dateKeyToDate(`${year}-01-01`), $lte: dateKeyToDate(lastWorkingDay) },
  })
    .select("_id payPeriodEnd")
    .lean();
  const runIds = runs.map((run) => run._id);
  // 13th month already paid for the year: adjustments, an approved or released 13th-month run, and a
  // true-up paid the next January (one reader shared with the 13th-month run, payroll plan Phase 3).
  const [records, thirteenthPaid] = await Promise.all([
    PayrollRecordModel.find({ payrollRunId: { $in: runIds }, employeeId: employeeObjectId }).select("payrollRunId earnings").lean(),
    thirteenthMonthPaid(orgObjectId, year, [employeeObjectId]),
  ]);
  const paidRunIds = new Set(records.map((record) => record.payrollRunId.toString()));
  const lastPaidThrough = runs
    .filter((run) => paidRunIds.has(run._id.toString()))
    .map((run) => dateToDateKey(run.payPeriodEnd))
    .sort()
    .pop() ?? null;
  // The same base the 13th-month run uses (engine/thirteenth-month.ts), so the two can't disagree.
  const basicEarnedThisYear = basicEarnedFrom(records.flatMap((record) => record.earnings ?? []));

  // Unused days of leave types HR marked convertible.
  const [balances, convertibleTypes] = await Promise.all([
    LeaveBalanceService.summarizeForYear(organizationId, year),
    LeaveTypeModel.find({ organizationId: orgObjectId, convertibleAtSeparation: true }).select("name").lean(),
  ]);
  const convertibleName = new Map(convertibleTypes.map((type) => [type._id.toString(), type.name as string]));
  const convertibleLeave = balances
    .filter((balance) => balance.employeeId === employeeId && convertibleName.has(balance.leaveTypeId) && balance.availableDays !== null && balance.availableDays > 0)
    .map((balance) => ({ leaveTypeName: convertibleName.get(balance.leaveTypeId)!, days: balance.availableDays as number }));

  return {
    calculator: {
      rateType: terms.rateType as "monthly" | "daily",
      rate: terms.rate,
      workDaysPerYear: policy.workDaysPerYear,
      workWeekDays: policy.workWeekDays?.length ? policy.workWeekDays : [1, 2, 3, 4, 5],
      lastPaidThrough,
      basicEarnedThisYear,
      thirteenthMonthPaidThisYear: thirteenthPaid.get(employeeId) ?? 0,
      thirteenthMonthDivisor: payPremiumsOf(policy).thirteenthMonthDivisor,
      convertibleLeave,
      deMinimisLeaveDays: (ruleResolved?.policy as { deMinimisLeaveDays?: number | null } | undefined)?.deMinimisLeaveDays ?? null,
    },
    finalPayDeadlineDays: policy.finalPayDeadlineDays ?? 30,
    minimumWageEarner: !!terms.minimumWageEarner,
    projectId: projectId ?? null,
    policy,
    ruleVersion: ruleResolved?.policy ?? null,
  };
}

/** The facts behind the variance checks (Gate D V1–V9) that come from live records. */
async function liveFacts(settlement: { organizationId: Types.ObjectId; employeeId: Types.ObjectId; clearanceCaseId: Types.ObjectId; inputs?: unknown }, policy: { recentPayChangeDays?: number | null } | null, lastWorkingDay: string) {
  const inputs = (settlement.inputs ?? {}) as { lastPaidThrough?: string | null };
  const year = Number(lastWorkingDay.slice(0, 4));
  const unpaidFrom = inputs.lastPaidThrough ? addDays(inputs.lastPaidThrough, 1) : `${lastWorkingDay.slice(0, 7)}-01`;
  const windowDays = policy?.recentPayChangeDays ?? RECENT_PAY_CHANGE_DAYS_DEFAULT;

  const [pending13th, unfinished, termRows, employee, employments, clearance] = await Promise.all([
    PayrollRunModel.find({ organizationId: settlement.organizationId, runType: "thirteenth_month", status: { $in: ["draft", "submitted"] }, payPeriodStart: dateKeyToDate(`${year}-01-01`) }).select("runNumber").lean(),
    unpaidFrom <= lastWorkingDay
      ? PayrollRunModel.find({
          organizationId: settlement.organizationId,
          runType: { $in: [null, "regular"] },
          status: { $in: ["draft", "submitted"] },
          payPeriodStart: { $lte: dateKeyToDate(lastWorkingDay) },
          payPeriodEnd: { $gte: dateKeyToDate(unpaidFrom) },
        })
          .select("_id runNumber")
          .lean()
      : Promise.resolve([]),
    CompensationModel.find({ organizationId: settlement.organizationId, employeeId: settlement.employeeId, effectiveFrom: { $lte: dateKeyToDate(lastWorkingDay) } }).sort({ effectiveFrom: 1 }).select("effectiveFrom").lean(),
    EmployeeModel.findById(settlement.employeeId).select("personId").lean(),
    EmploymentModel.find({ employeeId: settlement.employeeId }).sort({ effectiveFrom: -1 }).limit(1).lean(),
    ClearanceCaseModel.findById(settlement.clearanceCaseId).select("separationTypeCode").lean(),
  ]);
  // Only regular runs that would actually pay this employee (they are in the run, or it hasn't been computed for them).
  const unfinishedForEmployee = unfinished.length
    ? (await PayrollRecordModel.find({ payrollRunId: { $in: unfinished.map((run) => run._id) }, employeeId: settlement.employeeId }).select("payrollRunId").lean()).map((record) => record.payrollRunId.toString())
    : [];
  const unfinishedRuns = unfinished.filter((run) => unfinishedForEmployee.includes(run._id.toString())).map((run) => run.runNumber);

  const windowStart = addDays(lastWorkingDay, -windowDays);
  const changes = termRows.slice(1).map((row) => dateToDateKey(row.effectiveFrom)).filter((date) => date > windowStart);
  const person = employee ? await PersonModel.findById(employee.personId).select("sssNumber philHealthNumber pagIbigNumber tinNumber").lean() : null;
  const missingGovernmentIds = [
    ["SSS", person?.sssNumber],
    ["PhilHealth", person?.philHealthNumber],
    ["Pag-IBIG", person?.pagIbigNumber],
    ["TIN", person?.tinNumber],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label as string);

  // Phase 5a slices 2 and 4: the employment must have ended on the last working day, with the status the separation type means.
  // An end scheduled for later (slice 3) counts as the ending, with its own date and status, until it is applied.
  let employmentProblem: string | null = null;
  const employment = employments[0];
  const endDate = employment?.effectiveTo ?? employment?.scheduledEnd?.effectiveTo;
  const endStatus = employment?.effectiveTo ? employment.status : employment?.scheduledEnd?.status;
  const scheduledNote = !employment?.effectiveTo && employment?.scheduledEnd ? " (scheduled)" : "";
  if (!employment || !endDate) {
    employmentProblem = `The employment hasn't been ended yet. End it in People › End employment, effective ${formatDateKey(lastWorkingDay)}.`;
  } else if (dateToDateKey(endDate) !== lastWorkingDay) {
    employmentProblem = `The employment ends on ${formatDateKey(dateToDateKey(endDate))}${scheduledNote}, but the clearance's last working day is ${formatDateKey(lastWorkingDay)}. Correct one of them.`;
  } else if (clearance) {
    const type = await SeparationTypeModel.findOne({ organizationId: settlement.organizationId, code: clearance.separationTypeCode }).select("code name metadata").lean();
    const expected = employmentStatusForSeparation(type, clearance.separationTypeCode);
    if (expected && endStatus !== expected) {
      employmentProblem = `The clearance says ${type?.name ?? clearance.separationTypeCode}, which ends employment as "${expected}", but the employment is recorded as "${endStatus}"${scheduledNote}. Correct the ending or the clearance.`;
    }
  }

  return {
    thirteenthMonthPending: pending13th.map((run) => run.runNumber),
    unfinishedRegularRuns: unfinishedRuns,
    recentPayChange: changes.at(-1) ?? null,
    recentPayChangeDays: windowDays,
    missingGovernmentIds,
    employmentProblem,
  };
}

type SettlementDoc = InstanceType<typeof FinalSettlementModel>;

/** Runs every check against the settlement as it stands (its stored figures) and live records. */
async function checksFor(settlement: SettlementDoc, policy: Parameters<typeof severitiesOf>[0] & { recentPayChangeDays?: number | null }, lastWorkingDay: string, inputsChanged: string[] = []): Promise<FinalPayCheck[]> {
  const inputs = (settlement.inputs ?? {}) as { thirteenthMonthPaidThisYear?: number; statutory?: { taxDifference?: number } };
  const lines = settlement.lines as SettlementLine[];
  const dailyRate = (settlement.inputs as { dailyRate?: number } | undefined)?.dailyRate ?? 0;
  const taxableLeave = sumMoney(lines.filter((line) => line.code === "leave_encashment" && line.taxable).map((line) => line.amount));
  const facts = await liveFacts(settlement, policy, lastWorkingDay);
  return runFinalPayChecks(
    {
      net: settlement.totals?.net ?? 0,
      taxableLeaveDays: dailyRate > 0 ? roundMoney(taxableLeave / dailyRate) : 0,
      thirteenthMonthPaid: inputs.thirteenthMonthPaidThisYear ?? 0,
      taxDifference: inputs.statutory?.taxDifference ?? 0,
      inputsChanged,
      ...facts,
    },
    severitiesOf(policy),
  );
}

/**
 * The settlement's last working day: from its stored inputs, or (a settlement stored without them, e.g. one
 * made before inputs carried every field) from its clearance.
 */
async function lastWorkingDayOf(settlement: { clearanceCaseId: Types.ObjectId; inputs?: unknown }): Promise<string> {
  const stored = (settlement.inputs as { lastWorkingDay?: string } | undefined)?.lastWorkingDay;
  if (stored) return stored;
  const clearance = await ClearanceCaseModel.findById(settlement.clearanceCaseId).select("lastWorkingDay").lean();
  if (!clearance) throw new NotFoundError("This settlement's clearance no longer exists");
  return dateToDateKey(clearance.lastWorkingDay);
}

async function policyFor(settlement: { organizationId: Types.ObjectId; employeeId: Types.ObjectId }, lastWorkingDay: string) {
  const assignment = await EmployeeAssignmentService.getAsOf(settlement.employeeId.toString(), dateKeyToDate(lastWorkingDay));
  const resolved = await PayrollPolicyService.resolve({ organizationId: settlement.organizationId.toString(), projectId: assignment?.projectId?.toString(), effectiveDate: dateKeyToDate(lastWorkingDay) });
  return resolved?.policy ?? null;
}

/** The inputs a fresh read would give, compared with the frozen ones (V9). */
const COMPARED_INPUTS: [string, string][] = [
  ["rate", "pay rate"],
  ["rateType", "pay basis"],
  ["lastPaidThrough", "last day paid by payroll"],
  ["basicEarnedThisYear", "basic pay earned this year"],
  ["thirteenthMonthPaidThisYear", "13th month paid this year"],
  ["convertibleLeave", "convertible leave"],
];
async function inputsChangedSince(settlement: SettlementDoc, lastWorkingDay: string): Promise<string[]> {
  const stored = (settlement.inputs ?? {}) as Record<string, unknown>;
  // Nothing stored to compare against (a settlement saved without its inputs).
  if (!("rate" in stored)) return [];
  try {
    const fresh = (await gatherInputs(settlement.organizationId.toString(), settlement.employeeId.toString(), lastWorkingDay)).calculator as Record<string, unknown>;
    return COMPARED_INPUTS.filter(([key]) => JSON.stringify(fresh[key] ?? null) !== JSON.stringify(stored[key] ?? null)).map(([, label]) => label);
  } catch {
    return ["pay terms or payroll policy (no longer found)"];
  }
}

/** The record line a settlement line becomes on the final payroll run. */
const RECORD_EARNING_CODE: Partial<Record<SettlementLine["code"], string>> = {
  salary_balance: "basic",
  leave_encashment: "leave_encashment",
  thirteenth_month: "thirteenth_month",
  tax_refund: "year_end_tax_refund",
  manual: "manual",
};

/**
 * Final settlement (ADR-032): the separation pay-out for one clearance case.
 * Prepared (and re-prepared) from live records while a draft, then
 * submitted once clearance is cleared, reviewed by HR, approved by a
 * different person than the preparer, and disbursed with the payment method
 * and reference, which closes the clearance and creates the final payroll run.
 */
export const FinalSettlementService = {
  async prepare(clearanceCaseId: string, organizationId: string, actor: Actor) {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const clearance = Types.ObjectId.isValid(clearanceCaseId) ? await ClearanceCaseModel.findOne({ _id: new Types.ObjectId(clearanceCaseId), organizationId: orgObjectId }) : null;
    if (!clearance) throw new NotFoundError("Clearance not found in this organization");
    if (clearance.status === "cancelled") throw new BusinessRuleError("This clearance was cancelled");

    let settlement = await FinalSettlementModel.findOne({ organizationId: orgObjectId, clearanceCaseId: clearance._id });
    if (settlement && !EDITABLE.includes(settlement.status)) {
      throw new ConflictError(`This settlement is ${settlement.status}; return it to draft before recomputing`);
    }

    const lastWorkingDay = dateToDateKey(clearance.lastWorkingDay);
    const gathered = await gatherInputs(organizationId, clearance.employeeId.toString(), lastWorkingDay);
    const accountabilities = clearance.items
      .filter((item) => item.status === "flagged" && (item.amount ?? 0) > 0)
      .map((item) => ({ itemId: item._id.toString(), label: item.note ? `${item.title}: ${item.note}` : item.title, amount: item.amount ?? 0 }));
    const manualLines: ManualLine[] = (settlement?.manualLines ?? []).map((line) => ({
      id: line._id.toString(),
      direction: line.direction as "earning" | "deduction",
      label: line.label,
      amount: line.amount,
      reason: line.reason,
      taxable: line.taxable ?? null,
    }));
    const calculatorInputs = { lastWorkingDay, ...gathered.calculator, accountabilities, manualLines };
    // First the pay-out itself, then contributions and the year's tax on it (payroll plan Phase 5), then the whole.
    const base = computeSettlement(calculatorInputs);
    const { annualization, ...statutory } = await settlementStatutory({
      organizationId: orgObjectId,
      employeeId: clearance.employeeId,
      lastWorkingDay,
      rateType: gathered.calculator.rateType,
      rate: gathered.calculator.rate,
      workDaysPerYear: gathered.calculator.workDaysPerYear,
      minimumWageEarner: gathered.minimumWageEarner,
      ruleVersion: gathered.ruleVersion as Parameters<typeof settlementStatutory>[0]["ruleVersion"],
      lines: base.lines,
    });
    const result = computeSettlement({ ...calculatorInputs, statutory });
    const inputs = {
      ...gathered.calculator,
      finalPayDeadlineDays: gathered.finalPayDeadlineDays,
      minimumWageEarner: gathered.minimumWageEarner,
      projectId: gathered.projectId,
      lastWorkingDay,
      dailyRate: result.dailyRate,
      statutory,
      annualization,
      ruleVersionId: gathered.ruleVersion?._id?.toString() ?? null,
      policyId: gathered.policy._id.toString(),
      computedAt: new Date(),
    };

    const isNew = !settlement;
    if (!settlement) {
      settlement = new FinalSettlementModel({
        organizationId: orgObjectId,
        clearanceCaseId: clearance._id,
        employeeId: clearance.employeeId,
        version: 1,
        preparedBy: toObjectId(actor.userId),
      });
    } else {
      settlement.version += 1;
    }
    settlement.set({ lines: result.lines, totals: result.totals, inputs });
    settlement.set("checks", await checksFor(settlement, gathered.policy, lastWorkingDay));
    settlement.history.push({ action: isNew ? "prepared" : "recomputed", at: new Date(), by: toObjectId(actor.userId), version: settlement.version });
    await saveWhileDraft(settlement);

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: isNew ? "final-settlement.prepared" : "final-settlement.recomputed",
      resourceType: "FinalSettlement",
      resourceId: settlement._id.toString(),
      after: { version: settlement.version, totals: result.totals, checks: settlement.checks.map((check: { code: string }) => check.code) },
    });
    return settlement;
  },

  async addManualLine(id: string, organizationId: string, input: ManualLineInput, actor: Actor) {
    const settlement = await requireSettlement(id, organizationId);
    if (!EDITABLE.includes(settlement.status)) throw new BusinessRuleError("Lines can only be added while the settlement is a draft");
    if (!input.reason.trim()) throw new ValidationError("Give the reason or basis for this line");
    if (!(input.amount > 0)) throw new ValidationError("Enter an amount above zero");
    // Gate D: every manual line is backed by a document on the employee's file.
    const document = Types.ObjectId.isValid(input.documentId)
      ? await EmployeeDocumentModel.findOne({ _id: new Types.ObjectId(input.documentId), organizationId: settlement.organizationId, employeeId: settlement.employeeId }).select("_id title").lean()
      : null;
    if (!document) throw new ValidationError("Attach a supporting document from this employee's documents");
    const taxable = input.direction === "earning" ? (input.taxable ?? true) : undefined;
    settlement.manualLines.push({ direction: input.direction, label: input.label.trim(), amount: input.amount, reason: input.reason.trim(), taxable, documentId: document._id, addedBy: toObjectId(actor.userId), addedAt: new Date() });
    await saveWhileDraft(settlement);
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "final-settlement.line-added",
      resourceType: "FinalSettlement",
      resourceId: id,
      after: { direction: input.direction, label: input.label, amount: input.amount, reason: input.reason, taxable, documentId: input.documentId },
    });
    return FinalSettlementService.prepare(settlement.clearanceCaseId.toString(), organizationId, actor);
  },

  async removeManualLine(id: string, organizationId: string, lineId: string, actor: Actor) {
    const settlement = await requireSettlement(id, organizationId);
    if (!EDITABLE.includes(settlement.status)) throw new BusinessRuleError("Lines can only be removed while the settlement is a draft");
    const line = settlement.manualLines.id(lineId);
    if (!line) throw new NotFoundError("Line not found on this settlement");
    const before = { label: line.label, amount: line.amount, reason: line.reason };
    line.deleteOne();
    await saveWhileDraft(settlement);
    await AuditService.record({ organizationId, actorUserId: actor.userId, action: "final-settlement.line-removed", resourceType: "FinalSettlement", resourceId: id, before });
    return FinalSettlementService.prepare(settlement.clearanceCaseId.toString(), organizationId, actor);
  },

  async act(id: string, organizationId: string, input: FinalSettlementActionInput, actor: Actor) {
    const settlement = await requireSettlement(id, organizationId);
    const note = input.note?.trim();
    const now = new Date();
    // Every transition below is checked against the status read here, and
    // written only if the stored status is still that one (see `commit`).
    const fromStatus = settlement.status;
    let entry: { action: string; at: Date; by?: Types.ObjectId; note?: string; version: number } | undefined;
    const record = (action: string, extraNote?: string) => {
      entry = { action, at: now, by: toObjectId(actor.userId), note: [note, extraNote].filter(Boolean).join(" · ") || undefined, version: settlement.version };
      settlement.history.push(entry);
    };
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};

    // Moving forward needs the settlement to deduct exactly what the
    // clearance flags right now: a flag raised, changed, cleared or waived
    // after it was computed stops it until it's recomputed.
    let checks: FinalPayCheck[] = [];
    let lastWorkingDay = "";
    if (FORWARD_ACTIONS.includes(input.action)) {
      const clearance = await ClearanceCaseModel.findById(settlement.clearanceCaseId).select("items").lean();
      const drift = accountabilityDrift(clearance?.items ?? [], settlement.lines);
      if (drift.length) {
        const fix = settlement.status === "draft" ? "Recompute the settlement first" : "Return it to draft and recompute it first";
        throw new BusinessRuleError(`The clearance's red flags changed since this settlement was computed (${drift.map(describeDrift).join("; ")}). ${fix}.`);
      }
      // Variance checks, re-run against live records (Gate D): a blocking one stops every forward step.
      lastWorkingDay = await lastWorkingDayOf(settlement);
      const policy = await policyFor(settlement, lastWorkingDay);
      const changed = input.action === "disburse" ? await inputsChangedSince(settlement, lastWorkingDay) : [];
      checks = await checksFor(settlement, policy, lastWorkingDay, changed);
      const blocking = checks.filter((check) => check.severity === "blocking");
      if (blocking.length) throw new BusinessRuleError(`Fix these before going on: ${blocking.map((check) => check.message).join(" ")}`);
      set.checks = checks;
    }

    let disbursal: { paidAt: Date } | null = null;
    switch (input.action) {
      case "submit": {
        if (settlement.status !== "draft") throw new BusinessRuleError("Only a draft can be submitted");
        const clearance = await ClearanceCaseModel.findById(settlement.clearanceCaseId).select("status").lean();
        if (clearance?.status !== "cleared") throw new BusinessRuleError("Clearance still has blocking items; resolve them before submitting the settlement");
        // Gate D: manual lines added before attachments were required need one now.
        const unsupported = settlement.manualLines.filter((line) => !line.documentId).map((line) => line.label);
        if (unsupported.length) throw new BusinessRuleError(`Attach a supporting document to: ${unsupported.join(", ")}. Remove the line and add it again with one.`);
        settlement.status = "submitted";
        record("submitted");
        break;
      }
      case "review":
        if (settlement.status !== "submitted") throw new BusinessRuleError("Only a submitted settlement can be reviewed");
        // Segregation of duties (ADR-032): whoever prepared or recomputed it can't review it either.
        if (actor.userId && settlement.history.some((entry) => ["prepared", "recomputed"].includes(entry.action) && entry.by?.toString() === actor.userId)) {
          throw new AuthorizationError("The person who prepared this settlement can't review it");
        }
        settlement.status = "reviewed";
        record("reviewed");
        break;
      case "approve": {
        if (settlement.status !== "reviewed") throw new BusinessRuleError("Only a reviewed settlement can be approved");
        // Maker-checker: whoever prepared or last recomputed it can't approve it.
        if (actor.userId && settlement.history.some((entry) => ["prepared", "recomputed"].includes(entry.action) && entry.by?.toString() === actor.userId)) {
          throw new AuthorizationError("The person who prepared this settlement can't approve it");
        }
        // Gate D Q4: every warning must be confirmed as checked.
        const warnings = checks.filter((check) => check.severity === "warning").map((check) => check.code);
        const acknowledged = new Set(input.acknowledgedWarnings ?? []);
        const unconfirmed = warnings.filter((code) => !acknowledged.has(code));
        if (unconfirmed.length) throw new BusinessRuleError("Confirm you've checked each warning on this settlement before approving it.");
        settlement.status = "approved";
        set.approval = { hash: settlementHash(settlement), version: settlement.version, at: now, by: toObjectId(actor.userId), acknowledgedWarnings: warnings };
        record("approved", warnings.length ? `Checked: ${checks.filter((check) => check.severity === "warning").map((check) => check.message).join(" ")}` : undefined);
        break;
      }
      case "return":
        if (!["submitted", "reviewed", "approved"].includes(settlement.status)) throw new BusinessRuleError("Only a submitted, reviewed or approved settlement can be returned");
        if (!note) throw new ValidationError("Say what needs correcting");
        settlement.status = "draft";
        unset.approval = 1;
        record("returned");
        break;
      case "disburse": {
        if (settlement.status !== "approved") throw new BusinessRuleError("Only an approved settlement can be disbursed");
        if (!input.paymentMethodCode) throw new BusinessRuleError("Choose how it was paid");
        if (!input.paymentReference?.trim()) throw new BusinessRuleError("Enter the payment reference (transfer reference, check number or receipt number)");
        await PaymentMethodService.assertValidCode(organizationId, input.paymentMethodCode);
        // Tamper evidence (ADR-032): the stored settlement must still be exactly what was approved.
        const approval = settlement.approval;
        // Approved before approvals were fingerprinted (payroll plan Phase 5): nothing to verify against; said in the history.
        const legacyApproval = !approval?.hash;
        if (!legacyApproval && (approval!.version !== settlement.version || approval!.hash !== settlementHash(settlement))) {
          await AuditService.record({ organizationId, actorUserId: actor.userId, action: "final-settlement.hash-mismatch", resourceType: "FinalSettlement", resourceId: id, metadata: { approvedVersion: approval?.version, version: settlement.version } });
          throw new BusinessRuleError("This settlement changed after it was approved. Return it to draft, recompute and approve it again.");
        }
        settlement.status = "disbursed";
        settlement.payment = { methodCode: input.paymentMethodCode, reference: input.paymentReference.trim(), paidAt: now };
        set.payment = settlement.payment;
        const changedNote = checks.find((check) => check.code === "inputs_changed")?.message;
        record("disbursed", [legacyApproval ? "Approved before approvals were fingerprinted, so not verified." : undefined, changedNote].filter(Boolean).join(" ") || undefined);
        disbursal = { paidAt: now };
        break;
      }
      case "cancel":
        if (!["draft", "submitted"].includes(settlement.status)) throw new BusinessRuleError("Only a draft or submitted settlement can be cancelled");
        if (!note) throw new ValidationError("Give a reason for cancelling");
        settlement.status = "cancelled";
        record("cancelled");
        break;
    }
    // The status change is a conditional update on the status checked above,
    // not a save of the in-memory document: two people acting at once (two
    // disbursals, approve vs return, cancel vs submit) can't both win, and
    // the loser gets a ConflictError instead of overwriting the winner.
    const commit = async (session?: ClientSession, extra: Record<string, unknown> = {}) => {
      const result = await FinalSettlementModel.updateOne(
        { _id: settlement._id, organizationId: settlement.organizationId, status: fromStatus },
        {
          $set: { status: settlement.status, ...set, ...extra },
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
          ...(entry ? { $push: { history: entry } } : {}),
        },
        { session },
      );
      if (result.matchedCount === 0) throw new ConflictError(CHANGED_ELSEWHERE);
    };
    let payrollRunId: Types.ObjectId | undefined;
    if (disbursal) {
      // Disbursed, the final payroll run and the clearance closed are one change (ADR-041): never one
      // without the others. The settlement's conditional update goes first, so a disbursal that lost the
      // race writes nothing.
      const prepared = await finalRunFor(settlement, disbursal.paidAt, actor, organizationId, lastWorkingDay);
      payrollRunId = prepared.run._id;
      await withTransaction(async (session) => {
        await commit(session, { payrollRunId });
        await PayrollRunModel.create([prepared.run], { session });
        await PayrollRecordModel.create([prepared.record], { session });
        await ClearanceCaseModel.updateOne({ _id: settlement.clearanceCaseId, organizationId: settlement.organizationId }, { $set: { status: "closed", active: false } }, { session });
      });
    } else {
      await commit();
    }

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: `final-settlement.${input.action}`,
      resourceType: "FinalSettlement",
      resourceId: id,
      after: {
        status: settlement.status,
        note,
        payment: input.action === "disburse" ? settlement.payment : undefined,
        hash: input.action === "approve" ? (set.approval as { hash: string }).hash : undefined,
        payrollRunId: payrollRunId?.toString(),
      },
      metadata: { checks: checks.map((check) => `${check.severity}:${check.code}`) },
    });
    const saved = await FinalSettlementModel.findById(settlement._id);
    if (!saved) throw new NotFoundError("Final settlement not found in this organization");
    return saved;
  },

  async getByClearance(clearanceCaseId: string, organizationId: string) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(clearanceCaseId)) return null;
    return FinalSettlementModel.findOne({ organizationId: new Types.ObjectId(organizationId), clearanceCaseId: new Types.ObjectId(clearanceCaseId) }).lean();
  },

  async getById(id: string, organizationId: string) {
    return requireSettlement(id, organizationId);
  },

  async listForOrganization(organizationId: string) {
    await connectMongoDB();
    return FinalSettlementModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ updatedAt: -1 }).lean();
  },
};

/**
 * The released `final` payroll run a disbursal creates (payroll plan Phase 5, Gate D §1): one record whose
 * lines are the settlement's, so the payslip, register, audit and Form 2316 read it like any run.
 */
async function finalRunFor(settlement: SettlementDoc, paidAt: Date, actor: Actor, organizationId: string, lastWorkingDay: string) {
  const stored = (settlement.inputs ?? {}) as {
    lastWorkingDay?: string;
    lastPaidThrough?: string | null;
    rateType?: "monthly" | "daily";
    rate?: number;
    dailyRate?: number;
    workDaysPerYear?: number;
    projectId?: string | null;
    policyId?: string | null;
    ruleVersionId?: string | null;
    statutory?: { contributions?: { code: string; name: string; employee: number; employer: number; extra: number }[] };
  };
  // A settlement stored without its project, policy or rule version: resolve them as of the last working day.
  let { projectId, policyId, ruleVersionId } = stored;
  if (projectId === undefined || !policyId || !ruleVersionId) {
    const assignment = await EmployeeAssignmentService.getAsOf(settlement.employeeId.toString(), dateKeyToDate(lastWorkingDay));
    projectId = projectId ?? assignment?.projectId?.toString() ?? null;
    const scope = { organizationId, projectId: projectId ?? undefined, effectiveDate: dateKeyToDate(lastWorkingDay) };
    policyId = policyId ?? (await PayrollPolicyService.resolve(scope))?.policy?._id?.toString() ?? null;
    ruleVersionId = ruleVersionId ?? (await PayrollRuleVersionService.resolve(scope))?.policy?._id?.toString() ?? null;
  }
  if (!policyId || !ruleVersionId) throw new BusinessRuleError("No payroll policy or rule version applies on the last working day, so the final payroll run can't be recorded. Add them, then try again.");
  const inputs = {
    ...stored,
    lastWorkingDay,
    projectId,
    policyId,
    ruleVersionId,
    rateType: stored.rateType ?? "monthly",
    rate: stored.rate ?? 0,
    dailyRate: stored.dailyRate ?? 0,
    workDaysPerYear: stored.workDaysPerYear ?? 261,
    lastPaidThrough: stored.lastPaidThrough ?? null,
  };
  const lines = settlement.lines as SettlementLine[];
  const netPay = settlement.totals?.net ?? 0;
  const salary = lines.find((line) => line.code === "salary_balance");
  const start = salary && inputs.lastPaidThrough ? addDays(inputs.lastPaidThrough, 1) : salary ? `${inputs.lastWorkingDay.slice(0, 7)}-01` : inputs.lastWorkingDay;
  const end = inputs.lastWorkingDay;
  const payDate = dateToDateKey(paidAt);
  await assertNoOverlap(organizationId, inputs.projectId ?? undefined, start, end, undefined, { runType: "final", employeeId: settlement.employeeId.toString() });

  const employee = await EmployeeModel.findById(settlement.employeeId).select("employeeNumber personId").lean();
  const person = employee ? await PersonModel.findById(employee.personId).select("firstName middleName lastName").lean() : null;
  const earnings = lines
    .filter((line) => line.direction === "earning")
    .map((line) => ({ code: RECORD_EARNING_CODE[line.code] ?? line.code, label: line.label, amount: line.amount, taxable: line.taxable ?? false }));
  const deductions = lines.filter((line) => line.direction === "deduction" && ["accountability", "manual"].includes(line.code)).map((line) => ({ code: line.code, label: line.label, amount: line.amount }));
  const contributions = (inputs.statutory?.contributions ?? []).filter((line) => line.employee > 0 || line.employer > 0).map((line) => ({ code: line.code, name: line.name, employee: line.employee, employer: line.employer, extra: line.extra }));
  const tax = sumMoney(lines.filter((line) => line.code === "tax").map((line) => line.amount));
  const employeeContributions = sumMoney(contributions.map((line) => line.employee));
  const grossPay = sumMoney(earnings.map((line) => line.amount));
  const totalDeductions = sumMoney([employeeContributions, tax, ...deductions.map((line) => line.amount)]);
  const runId = new Types.ObjectId();
  const by = toObjectId(actor.userId);
  const runNumber = await nextRunNumber(organizationId, payDate);
  const note = `Released from the final settlement (version ${settlement.version})`;

  const run = {
    _id: runId,
    organizationId: settlement.organizationId,
    runNumber,
    projectId: inputs.projectId ? new Types.ObjectId(inputs.projectId) : undefined,
    runType: "final",
    employeeId: settlement.employeeId,
    finalSettlementId: settlement._id,
    payFrequency: undefined as unknown as string,
    payPeriodStart: dateKeyToDate(start),
    payPeriodEnd: dateKeyToDate(end),
    payDate: dateKeyToDate(payDate),
    policyId: new Types.ObjectId(inputs.policyId),
    ruleVersionId: new Types.ObjectId(inputs.ruleVersionId),
    status: "released",
    source: { type: "manual" },
    totals: { employees: 1, grossPay, employeeContributions, employerContributions: sumMoney(contributions.map((line) => line.employer + line.extra)), tax, otherDeductions: sumMoney(deductions.map((line) => line.amount)), netPay: netPay },
    exclusions: [],
    computedAt: paidAt,
    preparedBy: by,
    approvedBy: by,
    approvedAt: paidAt,
    releasedBy: by,
    releasedAt: paidAt,
    releasedOn: dateKeyToDate(payDate),
    paymentReference: settlement.payment?.reference,
    history: [{ action: "released", status: "released", at: paidAt, by, note }],
  };
  const policy = await PayrollPolicyModel.findById(inputs.policyId).select("payFrequency hoursPerDay").lean();
  run.payFrequency = (policy?.payFrequency as string) ?? "semi-monthly";
  const record = {
    payrollRunId: runId,
    organizationId: settlement.organizationId,
    employeeId: settlement.employeeId,
    employeeNumber: employee?.employeeNumber ?? "",
    employeeName: formatPersonName(person),
    projectId: run.projectId,
    rateType: inputs.rateType,
    rate: inputs.rate,
    monthlyBasic: monthlyBasicFor(inputs.rateType, inputs.rate, inputs.workDaysPerYear),
    dailyRate: inputs.dailyRate,
    hourlyRate: roundMoney(inputs.dailyRate / ((policy as { hoursPerDay?: number } | null)?.hoursPerDay ?? 8)),
    attendance: {},
    earnings,
    contributions,
    deductions,
    grossPay,
    taxableIncome: Math.max(0, sumMoney([...earnings.filter((line) => line.taxable).map((line) => line.amount), -employeeContributions])),
    tax,
    employeeContributions,
    employerContributions: run.totals.employerContributions,
    totalDeductions,
    netPay,
    warnings: [],
    finalSettlement: { settlementId: settlement._id, version: settlement.version, hash: settlement.approval?.hash ?? "not-fingerprinted", lastWorkingDay: inputs.lastWorkingDay },
  };
  if (roundMoney(grossPay - totalDeductions) !== roundMoney(netPay)) {
    throw new BusinessRuleError("The final run doesn't add up to the settlement's net pay. Return it to draft and recompute it.");
  }
  return { run, record };
}
