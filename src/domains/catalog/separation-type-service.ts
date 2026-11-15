import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { SeparationTypeModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { createSimpleCatalogService } from "./simple-catalog-service";
import { EmploymentStatusService } from "./employment-status-service";

const base = createSimpleCatalogService(SeparationTypeModel, "SeparationType");

export const SeparationTypeService = {
  ...base,

  /**
   * Which employment status a separation type ends in (ADR-062, `metadata.employmentStatusCode`), set from the
   * catalog settings (gaps B26). A code must be one of the organization's employment statuses; `null` records
   * "no status" explicitly, so final pay skips the check even for a type with a default (resignation, termination).
   */
  async setEmploymentStatus(id: string, organizationId: string, employmentStatusCode: string | null, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("SeparationType not found in this organization");
    const orgObjectId = new Types.ObjectId(organizationId);
    const existing = await SeparationTypeModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgObjectId });
    if (!existing) throw new NotFoundError("SeparationType not found in this organization");
    if (employmentStatusCode) await EmploymentStatusService.assertValidCode(organizationId, employmentStatusCode);

    const metadata = { ...((existing.metadata as Record<string, unknown> | undefined) ?? {}) };
    const before = "employmentStatusCode" in metadata ? metadata.employmentStatusCode : undefined;
    metadata.employmentStatusCode = employmentStatusCode ?? "";
    const item = await SeparationTypeModel.findOneAndUpdate({ _id: existing._id, organizationId: orgObjectId }, { $set: { metadata } }, { returnDocument: "after" });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "separation-type.employment-status-set",
      resourceType: "SeparationType",
      resourceId: existing._id.toString(),
      before: { employmentStatusCode: before ?? null },
      after: { employmentStatusCode: employmentStatusCode ?? null },
    });
    return item!;
  },
};
