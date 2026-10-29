import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, EvaluationFollowUpModel, PerformanceEvaluationModel } from "@/server/db/models";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { RecordEvaluationFollowUpInput } from "@/shared/validation/performance";

/**
 * Probation evaluations handled outside PCAS HRIS (ADR-053): HR records that
 * the form was sent to the evaluator (by email or on paper), or that the
 * evaluation is complete. That takes the probation's "Evaluate … before
 * regularization" row off the dashboard; the record stays on the
 * employee's Job & history tab.
 */
export const EvaluationFollowUpService = {
  /** Records (or, for the same probation, replaces) the follow-up. */
  async record(input: RecordEvaluationFollowUpInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");

    const filter = { organizationId: new Types.ObjectId(input.organizationId), employeeId: new Types.ObjectId(input.employeeId), dueKey: input.dueKey, status: "active" as const };
    const before = await EvaluationFollowUpModel.findOne(filter).lean();
    const fields = {
      outcome: input.outcome,
      actionDate: new Date(`${input.actionDate}T00:00:00Z`),
      sentTo: input.sentTo?.trim() || undefined,
      remarks: input.remarks?.trim() || undefined,
      recordedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
    };
    const followUp = await EvaluationFollowUpModel.findOneAndUpdate(filter, { $set: fields, $setOnInsert: filter }, { upsert: true, returnDocument: "after" });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "evaluation-follow-up.recorded",
      resourceType: "EvaluationFollowUp",
      resourceId: followUp._id.toString(),
      before: before ? { outcome: before.outcome, actionDate: before.actionDate, sentTo: before.sentTo, remarks: before.remarks } : undefined,
      after: { employeeId: input.employeeId, dueKey: input.dueKey, outcome: followUp.outcome, actionDate: followUp.actionDate, sentTo: followUp.sentTo, remarks: followUp.remarks },
    });
    return followUp;
  },

  /** Undo: the record is kept as withdrawn, and the dashboard row comes back. */
  async withdraw(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();
    const followUp = await EvaluationFollowUpModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId), status: "active" });
    if (!followUp) throw new NotFoundError("Follow-up not found in this organization");
    followUp.status = "withdrawn";
    await followUp.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "evaluation-follow-up.withdrawn",
      resourceType: "EvaluationFollowUp",
      resourceId: followUp._id.toString(),
      before: { status: "active" },
      after: { status: "withdrawn" },
    });
    return followUp;
  },

  /** The organization's active follow-ups, for the dashboard. */
  async listActive(organizationId: string) {
    await connectMongoDB();
    return EvaluationFollowUpModel.find({ organizationId: new Types.ObjectId(organizationId), status: "active" })
      .select("employeeId dueKey outcome")
      .lean();
  },

  /** One employee's follow-ups, newest first, for the Job & history tab. */
  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return EvaluationFollowUpModel.find({ organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId), status: "active" })
      .sort({ actionDate: -1 })
      .lean();
  },

  /**
   * When each employee's latest evaluation of the given types was submitted
   * (or acknowledged): only ids and dates leave the database, so the
   * dashboard can tell a probation was evaluated in Performance.
   */
  async latestSubmittedByEmployee(organizationId: string, evaluationForCodes: Iterable<string>): Promise<Map<string, Date>> {
    const codes = [...evaluationForCodes];
    if (codes.length === 0) return new Map();
    await connectMongoDB();
    const rows = await PerformanceEvaluationModel.aggregate<{ _id: Types.ObjectId; submittedAt: Date }>([
      { $match: { organizationId: new Types.ObjectId(organizationId), evaluationFor: { $in: codes }, status: { $in: ["submitted", "acknowledged"] }, submittedAt: { $ne: null } } },
      { $group: { _id: "$employeeId", submittedAt: { $max: "$submittedAt" } } },
    ]);
    return new Map(rows.map((row) => [row._id.toString(), row.submittedAt]));
  },
};
