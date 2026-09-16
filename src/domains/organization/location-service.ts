import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LocationModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateLocationInput } from "@/shared/validation/organization-structure";

export const LocationService = {
  async create(input: CreateLocationInput, actor: { userId?: string }) {
    await connectMongoDB();

    let location;
    try {
      location = await LocationModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        name: input.name,
        code: input.code,
        address: input.address,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Location code "${input.code}" is already in use`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "location.created",
      resourceType: "Location",
      resourceId: location._id.toString(),
      after: { name: location.name, code: location.code },
    });

    return location;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LocationModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status: "active" | "inactive" },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const location = await LocationModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!location) throw new NotFoundError("Location not found in this organization");

    const before = { status: location.status };
    location.status = patch.status;
    await location.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "location.updated",
      resourceType: "Location",
      resourceId: location._id.toString(),
      before,
      after: { status: location.status },
    });

    return location;
  },
};
