import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { LocationModel, ProjectModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { slugifyUpperKebab } from "@/shared/slugify";
import type { CreateProjectInput, UpdateProjectInput } from "@/shared/validation/organization-structure";

export const ProjectService = {
  async create(input: CreateProjectInput, actor: { userId?: string }) {
    await connectMongoDB();

    if (input.locationId) {
      const locationExists = await LocationModel.exists({
        _id: new Types.ObjectId(input.locationId),
        organizationId: new Types.ObjectId(input.organizationId),
      });
      if (!locationExists) {
        throw new NotFoundError("Location not found in this organization");
      }
    }

    const code = input.code ?? slugifyUpperKebab(input.name);

    let project;
    try {
      project = await ProjectModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        locationId: input.locationId ? new Types.ObjectId(input.locationId) : undefined,
        name: input.name,
        code,
        description: input.description,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`A project named "${input.name}" already exists`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "project.created",
      resourceType: "Project",
      resourceId: project._id.toString(),
      after: { name: project.name, code: project.code, locationId: project.locationId },
    });

    return project;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return ProjectModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
  },

  /** "" clears description/locationId — same $set/$unset convention as LocationService.update. */
  async update(
    id: string,
    organizationId: string,
    patch: Omit<UpdateProjectInput, "organizationId" | "status">,
    actor: { userId?: string },
  ) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Project not found in this organization");

    const orgObjectId = new Types.ObjectId(organizationId);
    const existing = await ProjectModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgObjectId });
    if (!existing) throw new NotFoundError("Project not found in this organization");

    if (patch.locationId) {
      const locationExists = await LocationModel.exists({ _id: new Types.ObjectId(patch.locationId), organizationId: orgObjectId });
      if (!locationExists) throw new NotFoundError("Location not found in this organization");
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (patch.name !== undefined) set.name = patch.name;
    for (const key of ["description", "locationId"] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === "") unset[key] = "";
      else set[key] = key === "locationId" ? new Types.ObjectId(value) : value;
    }

    const project = await ProjectModel.findOneAndUpdate(
      { _id: existing._id, organizationId: orgObjectId },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { returnDocument: "after" },
    );
    if (!project) throw new NotFoundError("Project not found in this organization");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "project.updated",
      resourceType: "Project",
      resourceId: project._id.toString(),
      before: { name: existing.name, description: existing.description, locationId: existing.locationId },
      after: { name: project.name, description: project.description, locationId: project.locationId },
    });

    return project;
  },

  async updateStatus(
    id: string,
    organizationId: string,
    patch: { status: "active" | "inactive" },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const project = await ProjectModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) throw new NotFoundError("Project not found in this organization");

    const before = { status: project.status };
    project.status = patch.status;
    await project.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "project.updated",
      resourceType: "Project",
      resourceId: project._id.toString(),
      before,
      after: { status: project.status },
    });

    return project;
  },
};
