import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LeavePolicyModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import type { CreateLeavePolicyInput } from "@/shared/validation/leave";

export type { PolicySource };

type LeavePolicyDoc = NonNullable<Awaited<ReturnType<typeof LeavePolicyModel.findOne>>>;

export const LeavePolicyService = {
  async create(input: CreateLeavePolicyInput, actor: { userId?: string }) {
    await connectMongoDB();

    const policy = await LeavePolicyModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      leaveTypeId: new Types.ObjectId(input.leaveTypeId),
      name: input.name,
      annualEntitlementDays: input.annualEntitlementDays,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "leave-policy.created",
      resourceType: "LeavePolicy",
      resourceId: policy._id.toString(),
      after: { name: policy.name, leaveTypeId: policy.leaveTypeId, projectId: policy.projectId },
    });

    return policy;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive"; effectiveTo?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const policy = await LeavePolicyModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!policy) throw new NotFoundError("Leave policy not found in this organization");

    const before = { status: policy.status, effectiveTo: policy.effectiveTo };
    if (patch.status) policy.status = patch.status;
    if (patch.effectiveTo) policy.effectiveTo = patch.effectiveTo;
    await policy.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "leave-policy.updated",
      resourceType: "LeavePolicy",
      resourceId: policy._id.toString(),
      before,
      after: { status: policy.status, effectiveTo: policy.effectiveTo },
    });

    return policy;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LeavePolicyModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  /**
   * Organization → Project override resolution (AGENTS.md §26) via the
   * shared resolver (src/server/policies/resolve-org-project-policy.ts) —
   * the same shape AttendancePolicyService uses, scoped further to a
   * specific leaveTypeId via extraFilter.
   */
  async resolve(params: { organizationId: string; projectId?: string; leaveTypeId: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<LeavePolicyDoc>(LeavePolicyModel, {
      organizationId: params.organizationId,
      projectId: params.projectId,
      effectiveDate: params.effectiveDate,
      extraFilter: { leaveTypeId: new Types.ObjectId(params.leaveTypeId) },
    });
  },
};
