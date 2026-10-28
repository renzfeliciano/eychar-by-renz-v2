import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, EvaluationFollowUpModel, OrganizationModel, PerformanceEvaluationModel, PersonModel } from "@/server/db/models";
import { EvaluationFollowUpService } from "@/domains/performance/evaluation-follow-up-service";
import { regularizationEvaluationCodes } from "@/domains/performance/evaluation-purpose";
import { NotFoundError } from "@/shared/errors";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("EvaluationFollowUpService", () => {
  let organizationId: string;
  let employeeId: string;
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    await connectMongoDB();
    const organization = await OrganizationModel.create({ name: "Follow-up Co", slug: `follow-up-${unique()}` });
    organizationId = organization._id.toString();
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "Debbie", lastName: "Abellara" });
    employeeId = (await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `F-${unique()}` }))._id.toString();
  });

  const sent = () => ({ organizationId, employeeId, dueKey: "2026-11-12", outcome: "sent" as const, actionDate: "2026-10-01", sentTo: "Engr. Santos", remarks: "Sent via email on October 1, 2026" });

  it("records an evaluation as sent, audits it, and lists it for the dashboard and the profile", async () => {
    const followUp = await EvaluationFollowUpService.record(sent(), { userId });
    expect(followUp).toMatchObject({ outcome: "sent", sentTo: "Engr. Santos", dueKey: "2026-11-12", status: "active" });
    expect(followUp.actionDate.toISOString().slice(0, 10)).toBe("2026-10-01");

    expect((await EvaluationFollowUpService.listActive(organizationId)).map((row) => row.employeeId.toString())).toEqual([employeeId]);
    expect(await EvaluationFollowUpService.listForEmployee(employeeId, organizationId)).toHaveLength(1);
    const audit = await AuditLogModel.findOne({ resourceId: followUp._id, action: "evaluation-follow-up.recorded" }).lean();
    expect(audit?.after).toMatchObject({ outcome: "sent", sentTo: "Engr. Santos" });
  });

  it("replaces the record when the same probation is marked again (sent, then completed)", async () => {
    const first = await EvaluationFollowUpService.record(sent(), { userId });
    const second = await EvaluationFollowUpService.record({ ...sent(), outcome: "completed", actionDate: "2026-10-20", sentTo: undefined, remarks: "Returned signed" }, { userId });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(second.outcome).toBe("completed");
    expect(await EvaluationFollowUpModel.countDocuments({ employeeId, status: "active" })).toBe(1);
    const audit = await AuditLogModel.findOne({ resourceId: second._id, action: "evaluation-follow-up.recorded", "before.outcome": "sent" }).lean();
    expect(audit?.after).toMatchObject({ outcome: "completed" });
  });

  it("withdraws (undo) without deleting, and refuses another organization's records", async () => {
    const followUp = await EvaluationFollowUpService.record(sent(), { userId });
    const other = await OrganizationModel.create({ name: "Other", slug: `follow-up-other-${unique()}` });

    await expect(EvaluationFollowUpService.withdraw(followUp._id.toString(), other._id.toString(), { userId })).rejects.toThrow(NotFoundError);
    await expect(EvaluationFollowUpService.record({ ...sent(), organizationId: other._id.toString() }, { userId })).rejects.toThrow(NotFoundError);

    await EvaluationFollowUpService.withdraw(followUp._id.toString(), organizationId, { userId });
    expect(await EvaluationFollowUpService.listActive(organizationId)).toEqual([]);
    expect((await EvaluationFollowUpModel.findById(followUp._id).lean())?.status).toBe("withdrawn");
    await expect(EvaluationFollowUpService.withdraw(followUp._id.toString(), organizationId, { userId })).rejects.toThrow(NotFoundError);
  });

  it("finds each employee's latest submitted regularization evaluation, ignoring drafts and other types", async () => {
    const base = { organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId), evaluatorEmployeeId: new Types.ObjectId(), periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-10-31"), templateVersion: 1 };
    await PerformanceEvaluationModel.create({ ...base, evaluationFor: "regularization", status: "draft" });
    await PerformanceEvaluationModel.create({ ...base, evaluationFor: "probationary", status: "submitted", submittedAt: new Date("2026-10-20") });
    await PerformanceEvaluationModel.create({ ...base, evaluationFor: "regularization", status: "acknowledged", submittedAt: new Date("2026-10-05") });

    const codes = regularizationEvaluationCodes([{ code: "regularization", metadata: {} }, { code: "probationary", metadata: {} }]);
    const latest = await EvaluationFollowUpService.latestSubmittedByEmployee(organizationId, codes);
    expect(latest.get(employeeId)?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(await EvaluationFollowUpService.latestSubmittedByEmployee(organizationId, [])).toEqual(new Map());
  });
});

describe("regularizationEvaluationCodes", () => {
  it("reads the catalog flag, with the seeded code as the fallback", () => {
    expect([...regularizationEvaluationCodes([{ code: "final", metadata: { isRegularization: true } }, { code: "regularization", metadata: { isRegularization: false } }])]).toEqual(["final"]);
    expect([...regularizationEvaluationCodes([])]).toEqual(["regularization"]);
  });
});
