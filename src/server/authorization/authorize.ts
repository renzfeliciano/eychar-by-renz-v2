import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleAssignmentModel, RoleModel } from "@/server/db/models";
import { AuthorizationError } from "@/shared/errors";

export type AuthorizeInput = {
  userId: string;
  organizationId: string;
  permission: string;
};

/**
 * The single server-side authorization chokepoint (AGENTS.md §20/§22):
 * grants access only if the user has an active RoleAssignment in this exact
 * organization whose role carries the requested permission key. Never
 * check `user.role === "..."` anywhere else — call this instead.
 */
export async function authorize({ userId, organizationId, permission }: AuthorizeInput): Promise<void> {
  await connectMongoDB();

  const now = new Date();
  const assignments = await RoleAssignmentModel.find({
    userId: new Types.ObjectId(userId),
    organizationId: new Types.ObjectId(organizationId),
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
  })
    .select("roleId")
    .lean();

  if (assignments.length === 0) {
    throw new AuthorizationError(`Missing permission "${permission}" in this organization`);
  }

  const roleIds = assignments.map((assignment) => assignment.roleId);
  const grantingRole = await RoleModel.exists({
    _id: { $in: roleIds },
    // Missing status (any role seeded before this field existed) is
    // treated as active, the same permissive-when-unconfigured fallback
    // used for employment/attendance status metadata elsewhere.
    $or: [{ status: "active" }, { status: { $exists: false } }],
    // The Super Administrator's system role passes every check, including permissions added later.
    $and: [{ $or: [{ permissionKeys: permission }, { system: "super_admin" }] }],
  });

  if (!grantingRole) {
    throw new AuthorizationError(`Missing permission "${permission}" in this organization`);
  }
}

/**
 * Organization *membership* — any active role assignment in this
 * organization, regardless of which permissions it carries. Used for
 * "can this user select/see this organization at all", distinct from
 * `authorize()`'s permission-specific check for a given operation.
 */
export async function hasActiveRoleAssignment({
  userId,
  organizationId,
}: Pick<AuthorizeInput, "userId" | "organizationId">): Promise<boolean> {
  await connectMongoDB();

  const now = new Date();
  const assignment = await RoleAssignmentModel.exists({
    userId: new Types.ObjectId(userId),
    organizationId: new Types.ObjectId(organizationId),
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
  });

  return Boolean(assignment);
}

/**
 * What the user can do in this organization right now: the union of the
 * permission keys of their active roles, and whether one of them is the
 * Super Administrator's system role (which passes every check). Used to
 * stop anyone handing out more access than they hold themselves.
 */
export async function heldPermissions({
  userId,
  organizationId,
}: Pick<AuthorizeInput, "userId" | "organizationId">): Promise<{ superAdmin: boolean; keys: Set<string> }> {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(organizationId)) return { superAdmin: false, keys: new Set() };

  const now = new Date();
  const roleIds = await RoleAssignmentModel.find({
    userId: new Types.ObjectId(userId),
    organizationId: new Types.ObjectId(organizationId),
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
  }).distinct("roleId");
  if (roleIds.length === 0) return { superAdmin: false, keys: new Set() };

  const roles = await RoleModel.find({ _id: { $in: roleIds }, $or: [{ status: "active" }, { status: { $exists: false } }] })
    .select("permissionKeys system")
    .lean();
  const keys = new Set<string>();
  for (const role of roles) for (const key of (role.permissionKeys ?? []) as string[]) keys.add(key);
  return { superAdmin: roles.some((role) => role.system === "super_admin"), keys };
}
