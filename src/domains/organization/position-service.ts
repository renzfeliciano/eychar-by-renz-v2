import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PositionModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { slugifyUpperKebab } from "@/shared/slugify";
import type { CreatePositionInput } from "@/shared/validation/organization-structure";

export const PositionService = {
  async create(input: CreatePositionInput, actor: { userId?: string }) {
    await connectMongoDB();

    const code = input.code ?? slugifyUpperKebab(input.title);

    let position;
    try {
      position = await PositionModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        title: input.title,
        code,
        description: input.description,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`A position named "${input.title}" already exists`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "position.created",
      resourceType: "Position",
      resourceId: position._id.toString(),
      after: { title: position.title, code: position.code },
    });

    return position;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status?: "active" | "inactive"; effectiveTo?: Date },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const position = await PositionModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!position) throw new NotFoundError("Position not found in this organization");

    const before = { status: position.status, effectiveTo: position.effectiveTo };
    if (patch.status) position.status = patch.status;
    if (patch.effectiveTo) position.effectiveTo = patch.effectiveTo;
    await position.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "position.updated",
      resourceType: "Position",
      resourceId: position._id.toString(),
      before,
      after: { status: position.status, effectiveTo: position.effectiveTo },
    });

    return position;
  },

  /** Only currently-effective positions (AGENTS.md §16/§27) — a historical-date view is Phase 4. */
  async listCurrent(organizationId: string) {
    await connectMongoDB();

    const now = new Date();
    return PositionModel.find({
      organizationId: new Types.ObjectId(organizationId),
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    }).lean();
  },
};
