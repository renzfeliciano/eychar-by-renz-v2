import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleModel, PermissionModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateRoleInput, UpdateRoleInput } from "@/shared/validation/roles";

async function assertPermissionKeysValid(permissionKeys: string[]) {
  if (permissionKeys.length === 0) return;
  const count = await PermissionModel.countDocuments({ key: { $in: permissionKeys } });
  if (count !== new Set(permissionKeys).size) {
    throw new BusinessRuleError("One or more permission keys are not recognized");
  }
}

export const RoleService = {
  async create(input: CreateRoleInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertPermissionKeysValid(input.permissionKeys);

    let role;
    try {
      role = await RoleModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        name: input.name,
        description: input.description,
        permissionKeys: input.permissionKeys,
        status: input.status,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`A role named "${input.name}" already exists`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "role.created",
      resourceType: "Role",
      resourceId: role._id.toString(),
      after: { name: role.name, permissionKeys: role.permissionKeys },
    });

    return role;
  },

  /** A full edit — name/description/permission set/status together, not a narrow patch. */
  async update(id: string, organizationId: string, patch: Omit<UpdateRoleInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();
    await assertPermissionKeysValid(patch.permissionKeys);

    const role = await RoleModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!role) throw new NotFoundError("Role not found in this organization");

    const before = { permissionKeys: role.permissionKeys, status: role.status };
    role.name = patch.name;
    role.description = patch.description;
    role.permissionKeys = patch.permissionKeys;
    role.status = patch.status;

    try {
      await role.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`A role named "${patch.name}" already exists`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "role.updated",
      resourceType: "Role",
      resourceId: role._id.toString(),
      before,
      after: { permissionKeys: role.permissionKeys, status: role.status },
    });

    return role;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return RoleModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ name: 1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const role = await RoleModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!role) throw new NotFoundError("Role not found in this organization");
    return role;
  },

  /** The full permission catalog, for the role editor's checkbox list — not org-scoped, Permission is a global seeded catalog. */
  async listAvailablePermissions() {
    await connectMongoDB();
    return PermissionModel.find().sort({ category: 1, key: 1 }).lean();
  },
};
