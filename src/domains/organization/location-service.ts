import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LocationModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateLocationInput, UpdateLocationInput } from "@/shared/validation/organization-structure";

type LocationPatch = Omit<UpdateLocationInput, "organizationId" | "status">;

// A site center is only meaningful as a pair; half of one would make the
// geofence check silently compare against a default 0.
function assertCoordinatePair(latitude: unknown, longitude: unknown) {
  const hasLatitude = latitude !== undefined && latitude !== null;
  const hasLongitude = longitude !== undefined && longitude !== null;
  if (hasLatitude !== hasLongitude) {
    throw new BusinessRuleError("Latitude and longitude must be set together");
  }
}

function siteSnapshot(location: {
  name: string;
  code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
}) {
  return {
    name: location.name,
    code: location.code,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    geofenceRadiusMeters: location.geofenceRadiusMeters,
  };
}

export const LocationService = {
  async create(input: CreateLocationInput, actor: { userId?: string }) {
    await connectMongoDB();
    assertCoordinatePair(input.latitude, input.longitude);

    let location;
    try {
      location = await LocationModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        name: input.name,
        code: input.code,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        geofenceRadiusMeters: input.geofenceRadiusMeters,
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
      after: siteSnapshot(location),
    });

    return location;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return LocationModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  /**
   * findOneAndUpdate with an explicit $set/$unset split rather than
   * doc.save(): assigning `undefined` on a document doesn't persist as an
   * unset, so "" (clear this field) would otherwise silently no-op.
   */
  async update(id: string, organizationId: string, patch: LocationPatch, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Location not found in this organization");

    const orgObjectId = new Types.ObjectId(organizationId);
    const existing = await LocationModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgObjectId });
    if (!existing) throw new NotFoundError("Location not found in this organization");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === "") unset[key] = "";
      else set[key] = value;
    }

    const resultingLatitude = "latitude" in unset ? undefined : (set.latitude ?? existing.latitude);
    const resultingLongitude = "longitude" in unset ? undefined : (set.longitude ?? existing.longitude);
    assertCoordinatePair(resultingLatitude, resultingLongitude);

    let location;
    try {
      location = await LocationModel.findOneAndUpdate(
        { _id: existing._id, organizationId: orgObjectId },
        { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: "after", runValidators: true },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError(`Location code "${patch.code}" is already in use`);
      throw error;
    }
    if (!location) throw new NotFoundError("Location not found in this organization");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "location.updated",
      resourceType: "Location",
      resourceId: location._id.toString(),
      before: siteSnapshot(existing),
      after: siteSnapshot(location),
    });

    return location;
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
