import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleModel, PermissionModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { heldPermissions } from "@/server/authorization/authorize";
import type { CreateRoleInput, UpdateRoleInput } from "@/shared/validation/roles";
import { SUPER_ADMIN_ROLE_NAME, SuperAdminService, isDeletePermission, isReservedRoleName } from "./super-admin-service";

function assertNoDeletePermissions(permissionKeys: string[]) {
  if (permissionKeys.some(isDeletePermission)) throw new BusinessRuleError("Delete access belongs to the Super Administrator only and can't be added to a role");
}

async function assertPermissionKeysValid(permissionKeys: string[]) {
  if (permissionKeys.length === 0) return;
  const count = await PermissionModel.countDocuments({ key: { $in: permissionKeys } });
  if (count !== new Set(permissionKeys).size) {
    throw new BusinessRuleError("One or more permission keys are not recognized");
  }
}

/**
 * A person (not a system/seed call) may only put permissions on a role that
 * they hold themselves, unless they're the Super Administrator: otherwise
 * editing a role they (or a colleague) already hold would hand out access
 * no one granted. Keys already on the role are left alone.
 */
async function assertCanAddPermissions(actorUserId: string | undefined, organizationId: string, added: string[]) {
  if (!actorUserId || added.length === 0) return;
  const held = await heldPermissions({ userId: actorUserId, organizationId });
  if (held.superAdmin) return;
  const beyond = added.filter((key) => !held.keys.has(key));
  if (beyond.length > 0) {
    throw new AuthorizationError(`You can't add access you don't have yourself (${beyond.slice(0, 5).join(", ")}${beyond.length > 5 ? ", …" : ""})`);
  }
}

export const RoleService = {
  async create(input: CreateRoleInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertPermissionKeysValid(input.permissionKeys);
    if (isReservedRoleName(input.name)) throw new BusinessRuleError(`"${input.name.trim()}" is reserved for the ${SUPER_ADMIN_ROLE_NAME}`);
    assertNoDeletePermissions(input.permissionKeys);
    await SuperAdminService.assertCanManageAdminRole(actor.userId, input.organizationId, input.permissionKeys);
    await assertCanAddPermissions(actor.userId, input.organizationId, [...new Set(input.permissionKeys)]);

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
    if (role.system === "super_admin") throw new BusinessRuleError("The Super Administrator role can't be changed");
    if (isReservedRoleName(patch.name)) throw new BusinessRuleError(`"${patch.name.trim()}" is reserved for the ${SUPER_ADMIN_ROLE_NAME}`);
    assertNoDeletePermissions(patch.permissionKeys);
    // Both the role as it is and as it would become: HR can't strip or add admin power.
    await SuperAdminService.assertCanManageAdminRole(actor.userId, organizationId, [...(role.permissionKeys ?? []), ...patch.permissionKeys]);
    const existing = new Set<string>(role.permissionKeys ?? []);
    await assertCanAddPermissions(actor.userId, organizationId, [...new Set(patch.permissionKeys)].filter((key) => !existing.has(key)));

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
    // Delete permissions never appear in the role editor: they're the Super Administrator's alone.
    return PermissionModel.find({ key: { $not: /\.delete$/ } }).sort({ category: 1, key: 1 }).lean();
  },
};
