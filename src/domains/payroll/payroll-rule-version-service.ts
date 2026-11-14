import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRuleVersionModel, ProjectModel } from "@/server/db/models";
import { assertOptionalInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { resolveOrgProjectPolicy, type PolicySource } from "@/server/policies/resolve-org-project-policy";
import { dateKeyToDate } from "@/lib/date-key";
import { assertNoSameDayVersion } from "./same-day-version-guard";
import type { CreatePayrollRuleVersionInput } from "@/shared/validation/payroll";

export type { PolicySource };

type PayrollRuleVersionDoc = NonNullable<Awaited<ReturnType<typeof PayrollRuleVersionModel.findOne>>>;

export const PayrollRuleVersionService = {
  /**
   * Never edits an existing version: a correction is a new version with the
   * next versionNumber (usually "based on" the one it corrects), so a run's
   * snapshotted ruleVersionId keeps pointing at exactly what was used
   * (ENGINEERING.md §28).
   */
  async create(input: CreatePayrollRuleVersionInput, actor: { userId?: string }) {
    await connectMongoDB();

    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");
    await assertOptionalInOrganization(PayrollRuleVersionModel, input.basedOnVersionId, input.organizationId, "Rule version this is based on");
    const organizationId = new Types.ObjectId(input.organizationId);
    const effectiveFrom = input.effectiveFrom ? dateKeyToDate(input.effectiveFrom) : new Date();
    await assertNoSameDayVersion(PayrollRuleVersionModel, { organizationId: input.organizationId, projectId: input.projectId, effectiveFrom }, "rule version");
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
      annualTaxTable: input.annualTaxTable?.length ? input.annualTaxTable : undefined,
      benefitsExemptionCap: input.benefitsExemptionCap ?? undefined,
      form2316Boxes: input.form2316Boxes?.length ? input.form2316Boxes : undefined,
      form2316Excluded: input.form2316Excluded?.length ? input.form2316Excluded : undefined,
      basedOnVersionId: input.basedOnVersionId ? new Types.ObjectId(input.basedOnVersionId) : undefined,
      effectiveFrom,
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
        annualTaxTable: (version.annualTaxTable?.length ?? 0) > 0,
        benefitsExemptionCap: version.benefitsExemptionCap,
        form2316Boxes: version.form2316Boxes?.length ?? 0,
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

  /** Organization → Project override resolution (ENGINEERING.md §26) via the shared resolver. */
  async resolve(params: { organizationId: string; projectId?: string; effectiveDate: Date }) {
    await connectMongoDB();
    return resolveOrgProjectPolicy<PayrollRuleVersionDoc>(PayrollRuleVersionModel, params);
  },
};
