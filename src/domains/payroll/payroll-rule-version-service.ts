import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRuleVersionModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import { dateKeyToDate } from "@/lib/date-key";
import type { CreatePayrollRuleVersionInput } from "@/shared/validation/payroll";

export type { PolicySource };

type PayrollRuleVersionDoc = NonNullable<Awaited<ReturnType<typeof PayrollRuleVersionModel.findOne>>>;

export const PayrollRuleVersionService = {
  /**
   * Never edits an existing version: a correction is a new version with the
   * next versionNumber (usually "based on" the one it corrects), so a run's
   * snapshotted ruleVersionId keeps pointing at exactly what was used
   * (AGENTS.md §28).
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
      name: input.name,
      description: input.description,
      taxTables: input.taxTables,
      contributions: input.contributions,
      basedOnVersionId: input.basedOnVersionId ? new Types.ObjectId(input.basedOnVersionId) : undefined,
      ...(input.effectiveFrom ? { effectiveFrom: dateKeyToDate(input.effectiveFrom) } : {}),
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-rule-version.created",
      resourceType: "PayrollRuleVersion",
      resourceId: version._id.toString(),
      after: {
        versionNumber: version.versionNumber,
        name: version.name,
        projectId: version.projectId,
        taxTables: version.taxTables.map((table: { payFrequency: string }) => table.payFrequency),
        contributions: version.contributions.map((contribution: { code: string }) => contribution.code),
      },
      metadata: { basedOnVersionId: input.basedOnVersionId },
    });

    return version;
  },

  async updateStatus(id: string, organizationId: string, patch: { status?: "active" | "inactive"; effectiveTo?: Date }, actor: { userId?: string }) {
    await connectMongoDB();

    const version = await PayrollRuleVersionModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
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
    return PayrollRuleVersionModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ versionNumber: -1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Payroll rule version not found in this organization");
    const version = await PayrollRuleVersionModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!version) throw new NotFoundError("Payroll rule version not found in this organization");
    return version;
  },

  /** Organization → Project override resolution (AGENTS.md §26) via the shared resolver. */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<PayrollRuleVersionDoc>(PayrollRuleVersionModel, params);
  },
};
