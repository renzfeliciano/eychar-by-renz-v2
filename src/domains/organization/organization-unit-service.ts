import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationUnitModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateOrganizationUnitInput } from "@/shared/validation/organization-structure";

export const OrganizationUnitService = {
  async create(input: CreateOrganizationUnitInput, actor: { userId?: string }) {
    await connectMongoDB();

    if (input.parentUnitId) {
      const parentExists = await OrganizationUnitModel.exists({
        _id: new Types.ObjectId(input.parentUnitId),
        organizationId: new Types.ObjectId(input.organizationId),
      });
      if (!parentExists) {
        throw new NotFoundError("Parent organization unit not found in this organization");
      }
    }

    let unit;
    try {
      unit = await OrganizationUnitModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        parentUnitId: input.parentUnitId ? new Types.ObjectId(input.parentUnitId) : undefined,
        type: input.type,
        name: input.name,
        code: input.code,
        description: input.description,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Organization unit code "${input.code}" is already in use`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "organization-unit.created",
      resourceType: "OrganizationUnit",
      resourceId: unit._id.toString(),
      after: { name: unit.name, code: unit.code, type: unit.type, parentUnitId: unit.parentUnitId },
    });

    return unit;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive"; effectiveTo?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const unit = await OrganizationUnitModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!unit) throw new NotFoundError("Organization unit not found in this organization");

    const before = { status: unit.status, effectiveTo: unit.effectiveTo };
    if (patch.status) unit.status = patch.status;
    if (patch.effectiveTo) unit.effectiveTo = patch.effectiveTo;
    await unit.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "organization-unit.updated",
      resourceType: "OrganizationUnit",
      resourceId: unit._id.toString(),
      before,
      after: { status: unit.status, effectiveTo: unit.effectiveTo },
    });

    return unit;
  },

  /** Only currently-effective units (AGENTS.md §16/§27) — a historical-date view is Phase 4. */
  async listCurrent(organizationId: string) {
    await connectMongoDB();

    const now = new Date();
    return OrganizationUnitModel.find({
      organizationId: new Types.ObjectId(organizationId),
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    }).lean();
  },
};
