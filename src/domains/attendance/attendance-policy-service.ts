import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendancePolicyModel, ProjectModel } from "@/server/db/models";
import { assertOptionalInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import type { CreateAttendancePolicyInput } from "@/shared/validation/attendance";

export type { PolicySource };

type AttendancePolicyDoc = NonNullable<Awaited<ReturnType<typeof AttendancePolicyModel.findOne>>>;

export const AttendancePolicyService = {
  async create(input: CreateAttendancePolicyInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");

    const policy = await AttendancePolicyModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      name: input.name,
      standardStartTime: input.standardStartTime,
      standardEndTime: input.standardEndTime,
      gracePeriodMinutes: input.gracePeriodMinutes,
      workDays: input.workDays,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "attendance-policy.created",
      resourceType: "AttendancePolicy",
      resourceId: policy._id.toString(),
      after: { name: policy.name, projectId: policy.projectId },
    });

    return policy;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return AttendancePolicyModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive"; effectiveTo?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const policy = await AttendancePolicyModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!policy) throw new NotFoundError("Attendance policy not found in this organization");

    const before = { status: policy.status, effectiveTo: policy.effectiveTo };
    if (patch.status) policy.status = patch.status;
    if (patch.effectiveTo) policy.effectiveTo = patch.effectiveTo;
    await policy.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "attendance-policy.updated",
      resourceType: "AttendancePolicy",
      resourceId: policy._id.toString(),
      before,
      after: { status: policy.status, effectiveTo: policy.effectiveTo },
    });

    return policy;
  },

  /**
   * Organization → Project override resolution (AGENTS.md §26) via the
   * shared resolver (src/server/policies/resolve-org-project-policy.ts) —
   * extracted once Leave needed the identical shape (see ADR-011).
   */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<AttendancePolicyDoc>(AttendancePolicyModel, params);
  },
};
