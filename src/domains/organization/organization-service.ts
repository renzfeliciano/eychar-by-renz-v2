import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError } from "@/shared/errors";

export type CreateOrganizationInput = {
  name: string;
  slug: string;
};

export const OrganizationService = {
  async create(input: CreateOrganizationInput, actor: { userId?: string }) {
    await connectMongoDB();

    const existing = await OrganizationModel.exists({ slug: input.slug });
    if (existing) throw new ConflictError(`Organization slug "${input.slug}" is already in use`);

    const organization = await OrganizationModel.create({
      name: input.name,
      slug: input.slug,
    });

    await AuditService.record({
      organizationId: organization._id.toString(),
      actorUserId: actor.userId,
      action: "organization.created",
      resourceType: "Organization",
      resourceId: organization._id.toString(),
      after: { name: organization.name, slug: organization.slug },
    });

    return organization;
  },

  /**
   * Organizations this user currently has an active RoleAssignment in —
   * the server-side scoping for "my organizations" (never trust a
   * client-supplied organizationId list, per AGENTS.md §36).
   */
  async listAccessibleTo(userId: string) {
    await connectMongoDB();

    const now = new Date();
    const organizationIds = await RoleAssignmentModel.distinct("organizationId", {
      userId: new Types.ObjectId(userId),
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    });

    return OrganizationModel.find({ _id: { $in: organizationIds } }).lean();
  },
};
