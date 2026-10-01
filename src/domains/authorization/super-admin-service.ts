import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleAssignmentModel, RoleModel, PermissionModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { AuthorizationError, BusinessRuleError } from "@/shared/errors";

export const SUPER_ADMIN_ROLE_NAME = "Super Administrator";

/**
 * Permissions that make someone an administrator: managing roles, handing
 * them out, and managing accounts. Only the Super Administrator can create,
 * edit, assign or revoke a role that carries any of these, so nobody else
 * can make another admin.
 */
export const ADMIN_PERMISSION_KEYS = ["roles.create", "roles.update", "roles.assign", "users.create", "users.update"] as const;

/** Delete permissions belong to the Super Administrator alone; no role may carry one. */
export function isDeletePermission(key: string): boolean {
  return key.endsWith(".delete");
}

/** "Super Administrator", "Super Admin", "super-admin", "SUPERADMIN"... are all reserved. */
export function isReservedRoleName(name: string): boolean {
  return /^super[\s_-]*admin(istrator)?$/i.test(name.trim());
}

export function grantsAdminPower(permissionKeys: readonly string[] | null | undefined): boolean {
  return (permissionKeys ?? []).some((key) => (ADMIN_PERMISSION_KEYS as readonly string[]).includes(key));
}

const activeAssignment = () => {
  const now = new Date();
  return { effectiveFrom: { $lte: now }, $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }] };
};

/**
 * The organization's single Super Administrator: a system role that passes
 * every permission check (including permissions added later). It is set up
 * only by the seed script, never through the app, and there is exactly one
 * holder.
 */
export const SuperAdminService = {
  async isSuperAdmin(userId: string | undefined, organizationId: string): Promise<boolean> {
    if (!userId || !Types.ObjectId.isValid(userId)) return false;
    await connectMongoDB();
    const role = await RoleModel.findOne({ organizationId: new Types.ObjectId(organizationId), system: "super_admin" }).select("_id").lean();
    if (!role) return false;
    return Boolean(await RoleAssignmentModel.exists({ organizationId: new Types.ObjectId(organizationId), roleId: role._id, userId: new Types.ObjectId(userId), ...activeAssignment() }));
  },

  /** Whether the user holds the Super Administrator role in any organization (for the session token). */
  async isSuperAdminAnywhere(userId: string | undefined): Promise<boolean> {
    if (!userId || !Types.ObjectId.isValid(userId)) return false;
    await connectMongoDB();
    const roles = await RoleModel.find({ system: "super_admin" }).distinct("_id");
    if (!roles.length) return false;
    return Boolean(await RoleAssignmentModel.exists({ roleId: { $in: roles }, userId: new Types.ObjectId(userId), ...activeAssignment() }));
  },

  /** Creates the role (idempotent) and gives it to `userId`. Refuses if someone else already holds it. */
  async ensure(organizationId: string, userId: string) {
    await connectMongoDB();
    const orgId = new Types.ObjectId(organizationId);
    const allKeys = (await PermissionModel.find().select("key").lean()).map((permission) => permission.key as string);
    const role = await RoleModel.findOneAndUpdate(
      { organizationId: orgId, system: "super_admin" },
      {
        $setOnInsert: { organizationId: orgId, system: "super_admin", name: SUPER_ADMIN_ROLE_NAME, status: "active" },
        $set: { description: "Full access to everything, including deletion. One holder only; set up outside the app.", permissionKeys: allKeys },
      },
      { upsert: true, returnDocument: "after" },
    );

    const holders = await RoleAssignmentModel.find({ organizationId: orgId, roleId: role._id, ...activeAssignment() }).lean();
    if (holders.some((holder) => holder.userId.toString() !== userId)) {
      throw new BusinessRuleError("Another account already holds the Super Administrator role");
    }
    if (holders.length === 0) {
      const assignment = await RoleAssignmentModel.create({ organizationId: orgId, roleId: role._id, userId: new Types.ObjectId(userId) });
      await AuditService.record({
        organizationId,
        action: "role-assignment.created",
        resourceType: "RoleAssignment",
        resourceId: assignment._id.toString(),
        after: { userId, roleId: role._id, role: SUPER_ADMIN_ROLE_NAME },
      });
    }
    return role;
  },

  /** A person (not a system/seed call) touching an admin-power role must be the Super Administrator. */
  async assertCanManageAdminRole(actorUserId: string | undefined, organizationId: string, permissionKeys: readonly string[] | null | undefined) {
    if (!actorUserId || !grantsAdminPower(permissionKeys)) return;
    if (!(await SuperAdminService.isSuperAdmin(actorUserId, organizationId))) {
      throw new AuthorizationError("Only the Super Administrator can create, change or hand out administrator roles");
    }
  },
};
