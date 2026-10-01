import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  ClearanceCaseModel,
  FinalSettlementModel,
  LeaveTypeModel,
  PayrollAdjustmentModel,
  PayrollRecordModel,
  PayrollRunModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { PaymentMethodService } from "@/domains/catalog/payment-method-service";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { sumMoney } from "@/domains/payroll/engine/money";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import type { FinalSettlementActionInput, ManualLineInput } from "@/shared/validation/final-settlement";
import { computeSettlement, type ManualLine } from "./settlement-calculator";

type Actor = { userId?: string };

const EDITABLE = ["draft"];
const BASIC_CODES = ["basic", "absences", "tardiness"];

const toObjectId = (id?: string) => (id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined);

async function requireSettlement(id: string, organizationId: string) {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Final settlement not found in this organization");
  const settlement = await FinalSettlementModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
  if (!settlement) throw new NotFoundError("Final settlement not found in this organization");
  return settlement;
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
  const resolved = await PayrollPolicyService.resolve({ organizationId, projectId: assignment?.projectId?.toString(), effectiveDate: dateKeyToDate(lastWorkingDay) });
  const policy = resolved?.policy;
  if (!policy) throw new BusinessRuleError("No payroll policy applies on the last working day. Add one in Payroll › Policies first.");

  // Payroll already approved or released this year, up to the last day.
  const runs = await PayrollRunModel.find({
    organizationId: orgObjectId,
    status: { $in: ["approved", "released"] },
    payPeriodEnd: { $gte: dateKeyToDate(`${year}-01-01`), $lte: dateKeyToDate(lastWorkingDay) },
  })
    .select("_id payPeriodEnd")
    .lean();
  const runIds = runs.map((run) => run._id);
  const [records, thirteenth] = await Promise.all([
    PayrollRecordModel.find({ payrollRunId: { $in: runIds }, employeeId: employeeObjectId }).select("payrollRunId earnings").lean(),
    PayrollAdjustmentModel.find({ payrollRunId: { $in: runIds }, employeeId: employeeObjectId, category: "thirteenth_month", direction: "earning" }).select("amount").lean(),
  ]);
  const paidRunIds = new Set(records.map((record) => record.payrollRunId.toString()));
  const lastPaidThrough = runs
    .filter((run) => paidRunIds.has(run._id.toString()))
    .map((run) => dateToDateKey(run.payPeriodEnd))
    .sort()
    .pop() ?? null;
  const basicEarnedThisYear = sumMoney(records.flatMap((record) => (record.earnings ?? []).filter((line: { code: string }) => BASIC_CODES.includes(line.code)).map((line: { amount: number }) => line.amount)));

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
    rateType: terms.rateType as "monthly" | "daily",
    rate: terms.rate,
    workDaysPerYear: policy.workDaysPerYear,
    finalPayDeadlineDays: policy.finalPayDeadlineDays ?? 30,
    workWeekDays: policy.workWeekDays?.length ? policy.workWeekDays : [1, 2, 3, 4, 5],
    lastPaidThrough,
    basicEarnedThisYear,
    thirteenthMonthPaidThisYear: sumMoney(thirteenth.map((adjustment) => adjustment.amount)),
    convertibleLeave,
  };
}

/**
 * Final settlement (ADR-032): the separation pay-out for one clearance case.
 * Prepared (and re-prepared) from live records while a draft, then
 * submitted once clearance is cleared, reviewed by HR, approved by a
 * different person than the preparer, and disbursed with the payment method
 * and reference, which closes the clearance.
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
    }));
    const { finalPayDeadlineDays, ...calculatorInputs } = gathered;
    const result = computeSettlement({ lastWorkingDay, ...calculatorInputs, accountabilities, manualLines });
    const inputs = { ...calculatorInputs, finalPayDeadlineDays, lastWorkingDay, dailyRate: result.dailyRate, computedAt: new Date() };

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
    settlement.history.push({ action: isNew ? "prepared" : "recomputed", at: new Date(), by: toObjectId(actor.userId), version: settlement.version });
    await settlement.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: isNew ? "final-settlement.prepared" : "final-settlement.recomputed",
      resourceType: "FinalSettlement",
      resourceId: settlement._id.toString(),
      after: { version: settlement.version, totals: result.totals },
    });
    return settlement;
  },

  async addManualLine(id: string, organizationId: string, input: ManualLineInput, actor: Actor) {
    const settlement = await requireSettlement(id, organizationId);
    if (!EDITABLE.includes(settlement.status)) throw new BusinessRuleError("Lines can only be added while the settlement is a draft");
    if (!input.reason.trim()) throw new ValidationError("Give the reason or basis for this line");
    if (!(input.amount > 0)) throw new ValidationError("Enter an amount above zero");
    settlement.manualLines.push({ direction: input.direction, label: input.label.trim(), amount: input.amount, reason: input.reason.trim(), addedBy: toObjectId(actor.userId), addedAt: new Date() });
    await settlement.save();
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "final-settlement.line-added",
      resourceType: "FinalSettlement",
      resourceId: id,
      after: { direction: input.direction, label: input.label, amount: input.amount, reason: input.reason },
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
    await settlement.save();
    await AuditService.record({ organizationId, actorUserId: actor.userId, action: "final-settlement.line-removed", resourceType: "FinalSettlement", resourceId: id, before });
    return FinalSettlementService.prepare(settlement.clearanceCaseId.toString(), organizationId, actor);
  },

  async act(id: string, organizationId: string, input: FinalSettlementActionInput, actor: Actor) {
    const settlement = await requireSettlement(id, organizationId);
    const note = input.note?.trim();
    const now = new Date();
    const record = (action: string) => settlement.history.push({ action, at: now, by: toObjectId(actor.userId), note: note || undefined, version: settlement.version });

    switch (input.action) {
      case "submit": {
        if (settlement.status !== "draft") throw new BusinessRuleError("Only a draft can be submitted");
        const clearance = await ClearanceCaseModel.findById(settlement.clearanceCaseId).select("status").lean();
        if (clearance?.status !== "cleared") throw new BusinessRuleError("Clearance still has blocking items; resolve them before submitting the settlement");
        settlement.status = "submitted";
        record("submitted");
        break;
      }
      case "review":
        if (settlement.status !== "submitted") throw new BusinessRuleError("Only a submitted settlement can be reviewed");
        settlement.status = "reviewed";
        record("reviewed");
        break;
      case "approve":
        if (settlement.status !== "reviewed") throw new BusinessRuleError("Only a reviewed settlement can be approved");
        // Maker-checker: whoever prepared or last recomputed it can't approve it.
        if (actor.userId && settlement.history.some((entry) => ["prepared", "recomputed"].includes(entry.action) && entry.by?.toString() === actor.userId)) {
          throw new AuthorizationError("The person who prepared this settlement can't approve it");
        }
        settlement.status = "approved";
        record("approved");
        break;
      case "return":
        if (!["submitted", "reviewed", "approved"].includes(settlement.status)) throw new BusinessRuleError("Only a submitted, reviewed or approved settlement can be returned");
        if (!note) throw new ValidationError("Say what needs correcting");
        settlement.status = "draft";
        record("returned");
        break;
      case "disburse": {
        if (settlement.status !== "approved") throw new BusinessRuleError("Only an approved settlement can be disbursed");
        if (!input.paymentMethodCode) throw new BusinessRuleError("Choose how it was paid");
        if (!input.paymentReference?.trim()) throw new BusinessRuleError("Enter the payment reference (transfer reference, check number or receipt number)");
        await PaymentMethodService.assertValidCode(organizationId, input.paymentMethodCode);
        settlement.status = "disbursed";
        settlement.payment = { methodCode: input.paymentMethodCode, reference: input.paymentReference.trim(), paidAt: now };
        record("disbursed");
        // Paying out closes the separation's clearance.
        await ClearanceCaseModel.updateOne({ _id: settlement.clearanceCaseId }, { $set: { status: "closed", active: false } });
        break;
      }
      case "cancel":
        if (!["draft", "submitted"].includes(settlement.status)) throw new BusinessRuleError("Only a draft or submitted settlement can be cancelled");
        if (!note) throw new ValidationError("Give a reason for cancelling");
        settlement.status = "cancelled";
        record("cancelled");
        break;
    }
    await settlement.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: `final-settlement.${input.action}`,
      resourceType: "FinalSettlement",
      resourceId: id,
      after: { status: settlement.status, note, payment: input.action === "disburse" ? settlement.payment : undefined },
    });
    return settlement;
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
