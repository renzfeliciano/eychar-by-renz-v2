import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendancePolicyModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateAttendancePolicyInput } from "@/shared/validation/attendance";

export type PolicySource = "organization" | "project";

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

// Attendance dates are calendar days, but effectiveFrom/effectiveTo are
// full timestamps (effectiveFrom defaults to the exact moment a policy is
// created). Comparing day-granular against timestamp-granular values
// requires widening to the whole day on both ends — otherwise a policy
// created at, say, 3pm today would not resolve for "today" (midnight),
// since its effectiveFrom would be later in the day than the lookup.
const EFFECTIVE_FILTER = (effectiveDate: Date) => ({
  status: "active",
  effectiveFrom: { $lte: endOfDayUtc(effectiveDate) },
  $or: [
    { effectiveTo: { $exists: false } },
    { effectiveTo: null },
    { effectiveTo: { $gte: startOfDayUtc(effectiveDate) } },
  ],
});

export const AttendancePolicyService = {
  async create(input: CreateAttendancePolicyInput, actor: { userId?: string }) {
    await connectMongoDB();

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
   * Organization → Project override resolution (AGENTS.md §26), explicit
   * and specific to Attendance — not a shared cross-domain dispatcher,
   * since Attendance is still the only policy-driven domain (see ADR-011).
   * The most specific active policy effective on `effectiveDate` wins:
   * project-scoped first, falling back to org-wide.
   */
  async resolve(params: {
    organizationId: string;
    projectId?: string;
    effectiveDate: Date;
  }): Promise<{ policy: NonNullable<Awaited<ReturnType<typeof AttendancePolicyModel.findOne>>>; source: PolicySource } | null> {
    await connectMongoDB();

    const orgObjectId = new Types.ObjectId(params.organizationId);

    if (params.projectId) {
      const projectPolicy = await AttendancePolicyModel.findOne({
        organizationId: orgObjectId,
        projectId: new Types.ObjectId(params.projectId),
        ...EFFECTIVE_FILTER(params.effectiveDate),
      }).sort({ effectiveFrom: -1 });
      if (projectPolicy) return { policy: projectPolicy, source: "project" };
    }

    const orgPolicy = await AttendancePolicyModel.findOne({
      organizationId: orgObjectId,
      projectId: { $exists: false },
      ...EFFECTIVE_FILTER(params.effectiveDate),
    }).sort({ effectiveFrom: -1 });
    if (orgPolicy) return { policy: orgPolicy, source: "organization" };

    return null;
  },
};
