import { Types, type Model } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

export type SimpleCatalogInput = {
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

/**
 * One create/list/updateStatus/getByCode/assertValidCode implementation,
 * reused by seven distinct models/collections (EmploymentType,
 * EmploymentStatus, AttendanceStatus, RecruitmentStage, EventCategory,
 * CaseClassification, CaseStatus) — each entity still has its own
 * MongoDB collection (matching the existing LeaveType/Position/Project
 * precedent), this factory just avoids retyping the same CRUD+audit logic
 * seven times. `resourceType` names the audit-log resource and action
 * prefix for whichever concrete model is bound.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSimpleCatalogService(CatalogModel: Model<any>, resourceType: string) {
  const actionPrefix = resourceType
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

  return {
    async create(input: SimpleCatalogInput, actor: { userId?: string }) {
      await connectMongoDB();

      let item;
      try {
        item = await CatalogModel.create({
          organizationId: new Types.ObjectId(input.organizationId),
          code: input.code,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder ?? 0,
          metadata: input.metadata ?? {},
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ConflictError(`Code "${input.code}" is already in use for ${resourceType}`);
        }
        throw error;
      }

      await AuditService.record({
        organizationId: input.organizationId,
        actorUserId: actor.userId,
        action: `${actionPrefix}.created`,
        resourceType,
        resourceId: item._id.toString(),
        after: { code: item.code, name: item.name },
      });

      return item;
    },

    async updateStatus(id: string, organizationId: string, patch: { status: "active" | "inactive" }, actor: { userId?: string }) {
      await connectMongoDB();

      const item = await CatalogModel.findOne({
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      });
      if (!item) throw new NotFoundError(`${resourceType} not found in this organization`);

      const before = { status: item.status };
      item.status = patch.status;
      await item.save();

      await AuditService.record({
        organizationId,
        actorUserId: actor.userId,
        action: `${actionPrefix}.updated`,
        resourceType,
        resourceId: item._id.toString(),
        before,
        after: { status: item.status },
      });

      return item;
    },

    async listCurrent(organizationId: string) {
      await connectMongoDB();
      return CatalogModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ sortOrder: 1 }).lean();
    },

    async getByCode(organizationId: string, code: string) {
      await connectMongoDB();
      return CatalogModel.findOne({ organizationId: new Types.ObjectId(organizationId), code }).lean();
    },

    /**
     * Permissive when unconfigured: an organization that hasn't set up
     * this list yet can write any code (unchanged behavior from before
     * this catalog existed). Once at least one item exists, the code must
     * match one of them and it must be active.
     */
    async assertValidCode(organizationId: string, code: string) {
      await connectMongoDB();

      const orgObjectId = new Types.ObjectId(organizationId);
      const anyConfigured = await CatalogModel.exists({ organizationId: orgObjectId });
      if (!anyConfigured) return;

      const match = await CatalogModel.findOne({ organizationId: orgObjectId, code, status: "active" });
      if (!match) {
        throw new BusinessRuleError(`"${code}" is not a configured, active ${resourceType} value for this organization`);
      }
    },
  };
}
