import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { EmployerTaxInput } from "@/shared/validation/payroll";

export type EmployerTax = { tin?: string; registeredName?: string; registeredAddress?: string; zipCode?: string; rdoCode?: string };

/** The employer's BIR registration printed on Form 2316 (payroll plan Phase 4, Gate C: one BIR employer per organization). */
export const EmployerTaxService = {
  async get(organizationId: string): Promise<EmployerTax & { name: string }> {
    await connectMongoDB();
    const organization = await OrganizationModel.findById(new Types.ObjectId(organizationId)).select("name tax").lean();
    if (!organization) throw new NotFoundError("Organization not found");
    return { name: organization.name, ...((organization as { tax?: EmployerTax }).tax ?? {}) };
  },

  async update(input: EmployerTaxInput, actor: { userId?: string }) {
    await connectMongoDB();
    const organization = await OrganizationModel.findById(new Types.ObjectId(input.organizationId));
    if (!organization) throw new NotFoundError("Organization not found");
    const before = { ...((organization.toObject() as { tax?: EmployerTax }).tax ?? {}) };
    const after: EmployerTax = { tin: input.tin, registeredName: input.registeredName, registeredAddress: input.registeredAddress, zipCode: input.zipCode, rdoCode: input.rdoCode };
    organization.set("tax", after);
    await organization.save();
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "organization.tax-updated",
      resourceType: "Organization",
      resourceId: input.organizationId,
      before,
      after,
    });
    return after;
  },
};
