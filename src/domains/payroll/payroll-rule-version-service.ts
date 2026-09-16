import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRuleVersionModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import type { CreatePayrollRuleVersionInput } from "@/shared/validation/payroll";

export type { PolicySource };

type PayrollRuleVersionDoc = NonNullable<Awaited<ReturnType<typeof PayrollRuleVersionModel.findOne>>>;

export const PayrollRuleVersionService = {
  /**
   * Never edits an existing version in place — a correction always creates
   * a new one with the next versionNumber, so a PayrollRun's snapshotted
   * ruleVersionId keeps pointing at exactly what was used (AGENTS.md §28).
   */
  async create(input: CreatePayrollRuleVersionInput, actor: { userId?: string }) {
    await connectMongoDB();

    const organizationId = new Types.ObjectId(input.organizationId);
    const latest = await PayrollRuleVersionModel.findOne({ organizationId }).sort({ versionNumber: -1 });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await PayrollRuleVersionModel.create({
      organizationId,
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      versionNumber,
      description: input.description,
      taxBrackets: input.taxBrackets ?? [],
      statutoryContributions: input.statutoryContributions ?? [],
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-rule-version.created",
      resourceType: "PayrollRuleVersion",
      resourceId: version._id.toString(),
      after: { versionNumber: version.versionNumber, projectId: version.projectId },
    });

    return version;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive"; effectiveTo?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const version = await PayrollRuleVersionModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!version) throw new NotFoundError("Payroll rule version not found in this organization");

    const before = { status: version.status, effectiveTo: version.effectiveTo };
    if (patch.status) version.status = patch.status;
    if (patch.effectiveTo) version.effectiveTo = patch.effectiveTo;
    await version.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "payroll-rule-version.updated",
      resourceType: "PayrollRuleVersion",
      resourceId: version._id.toString(),
      before,
      after: { status: version.status, effectiveTo: version.effectiveTo },
    });

    return version;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return PayrollRuleVersionModel.find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ versionNumber: -1 })
      .lean();
  },

  /** Organization → Project override resolution (AGENTS.md §26) via the shared resolver. */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<PayrollRuleVersionDoc>(PayrollRuleVersionModel, params);
  },
};
