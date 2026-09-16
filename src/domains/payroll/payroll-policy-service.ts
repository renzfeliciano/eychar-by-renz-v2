import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollPolicyModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import type { CreatePayrollPolicyInput } from "@/shared/validation/payroll";

export type { PolicySource };

type PayrollPolicyDoc = NonNullable<Awaited<ReturnType<typeof PayrollPolicyModel.findOne>>>;

export const PayrollPolicyService = {
  async create(input: CreatePayrollPolicyInput, actor: { userId?: string }) {
    await connectMongoDB();

    const policy = await PayrollPolicyModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      name: input.name,
      payFrequency: input.payFrequency,
      standardWorkDaysPerPeriod: input.standardWorkDaysPerPeriod,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-policy.created",
      resourceType: "PayrollPolicy",
      resourceId: policy._id.toString(),
      after: { name: policy.name, payFrequency: policy.payFrequency, projectId: policy.projectId },
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

    const policy = await PayrollPolicyModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!policy) throw new NotFoundError("Payroll policy not found in this organization");

    const before = { status: policy.status, effectiveTo: policy.effectiveTo };
    if (patch.status) policy.status = patch.status;
    if (patch.effectiveTo) policy.effectiveTo = patch.effectiveTo;
    await policy.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "payroll-policy.updated",
      resourceType: "PayrollPolicy",
      resourceId: policy._id.toString(),
      before,
      after: { status: policy.status, effectiveTo: policy.effectiveTo },
    });

    return policy;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return PayrollPolicyModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  /** Organization → Project override resolution (AGENTS.md §26) via the shared resolver. */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<PayrollPolicyDoc>(PayrollPolicyModel, params);
  },
};
