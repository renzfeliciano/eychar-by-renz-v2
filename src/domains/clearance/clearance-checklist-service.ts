import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ClearanceChecklistItemModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import type { CreateChecklistItemInput, UpdateChecklistItemInput } from "@/shared/validation/clearance";

function snapshot(item: { departmentCode: string; title: string; blocking: boolean; dueDaysAfterLastDay: number; status?: string }) {
  return { departmentCode: item.departmentCode, title: item.title, blocking: item.blocking, dueDaysAfterLastDay: item.dueDaysAfterLastDay, status: item.status };
}

/** The organization's clearance checklist (ADR-031), managed from the Clearance page. */
export const ClearanceChecklistService = {
  async create(input: CreateChecklistItemInput, actor: { userId?: string }) {
    await connectMongoDB();
    await ClearanceDepartmentService.assertValidCode(input.organizationId, input.departmentCode);
    const organizationId = new Types.ObjectId(input.organizationId);
    const last = await ClearanceChecklistItemModel.findOne({ organizationId, departmentCode: input.departmentCode }).sort({ sortOrder: -1 }).lean();

    const item = await ClearanceChecklistItemModel.create({
      organizationId,
      departmentCode: input.departmentCode,
      title: input.title,
      description: input.description,
      blocking: input.blocking,
      dueDaysAfterLastDay: input.dueDaysAfterLastDay,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "clearance-checklist.created",
      resourceType: "ClearanceChecklistItem",
      resourceId: item._id.toString(),
      after: snapshot(item),
    });
    return item;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return ClearanceChecklistItemModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ departmentCode: 1, sortOrder: 1 }).lean();
  },

  async update(id: string, organizationId: string, patch: UpdateChecklistItemInput & { status?: "active" | "inactive" }, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Checklist item not found in this organization");
    const item = await ClearanceChecklistItemModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!item) throw new NotFoundError("Checklist item not found in this organization");
    if (patch.departmentCode) await ClearanceDepartmentService.assertValidCode(organizationId, patch.departmentCode);

    const before = snapshot(item);
    for (const [key, value] of Object.entries(patch)) if (value !== undefined) item.set(key, value);
    await item.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "clearance-checklist.updated",
      resourceType: "ClearanceChecklistItem",
      resourceId: item._id.toString(),
      before,
      after: snapshot(item),
    });
    return item;
  },
};
