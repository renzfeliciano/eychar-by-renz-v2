import { organizationUserIds, userBelongsToOrganization } from "@/domains/identity/user-directory";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { RoleAssignmentModel, RoleModel, UserModel, PersonModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { heldPermissions } from "@/server/authorization/authorize";
import { SuperAdminService } from "./super-admin-service";
import { viewerSeesHidden } from "@/server/db/visibility-context";
import { formatPersonName } from "@/lib/person-name";
import type { AssignRoleInput } from "@/shared/validation/roles";

export const RoleAssignmentService = {
  /**
   * Whether `actor` may hand this role out in this organization, checked
   * before anything is written (StaffAccountService runs it before creating
   * the account). A person (not a system/seed call, which has no actor) may
   * only grant permissions they hold themselves, unless they're the
   * organization's Super Administrator; admin-power roles stay the Super
   * Administrator's alone (assertCanManageAdminRole).
   */
  async assertCanGrant(input: Pick<AssignRoleInput, "organizationId" | "roleId">, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(input.roleId) || !Types.ObjectId.isValid(input.organizationId)) throw new NotFoundError("Role not found in this organization");
    const role = await RoleModel.findOne({ _id: new Types.ObjectId(input.roleId), organizationId: new Types.ObjectId(input.organizationId) }).select("system permissionKeys").lean();
    if (!role) throw new NotFoundError("Role not found in this organization");
    if (role.system === "super_admin") throw new BusinessRuleError("The Super Administrator role can't be assigned from the app");
    await SuperAdminService.assertCanManageAdminRole(actor.userId, input.organizationId, role.permissionKeys);

    if (!actor.userId) return role;
    const held = await heldPermissions({ userId: actor.userId, organizationId: input.organizationId });
    if (held.superAdmin) return role;
    const beyond = ((role.permissionKeys ?? []) as string[]).filter((key) => !held.keys.has(key));
    if (beyond.length > 0) {
      throw new AuthorizationError(`You can't give a role with access you don't have yourself (${beyond.slice(0, 5).join(", ")}${beyond.length > 5 ? ", …" : ""})`);
    }
    return role;
  },

  async assign(input: AssignRoleInput, actor: { userId?: string }) {
    await connectMongoDB();

    await RoleAssignmentService.assertCanGrant(input, actor);

    if (!Types.ObjectId.isValid(input.userId)) throw new NotFoundError("User not found");
    const userExists = await UserModel.exists({ _id: new Types.ObjectId(input.userId) });
    if (!userExists) throw new NotFoundError("User not found");
    // A person can only give roles to accounts already in this organization
    // (a role here, its employee or its staff person record): otherwise an
    // administrator could pull another organization's account in and then
    // reset its password. System/seed calls (no actor) set up memberships.
    if (actor.userId && !(await userBelongsToOrganization(input.userId, input.organizationId))) {
      throw new NotFoundError("User not found in this organization");
    }

    const now = new Date();
    const alreadyAssigned = await RoleAssignmentModel.exists({
      userId: new Types.ObjectId(input.userId),
      roleId: new Types.ObjectId(input.roleId),
      organizationId: new Types.ObjectId(input.organizationId),
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    });
    if (alreadyAssigned) throw new ConflictError("This user already holds this role");

    const assignment = await RoleAssignmentModel.create({
      userId: new Types.ObjectId(input.userId),
      roleId: new Types.ObjectId(input.roleId),
      organizationId: new Types.ObjectId(input.organizationId),
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "role-assignment.created",
      resourceType: "RoleAssignment",
      resourceId: assignment._id.toString(),
      after: { userId: assignment.userId, roleId: assignment.roleId },
    });

    return assignment;
  },

  async revoke(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const assignment = await RoleAssignmentModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!assignment) throw new NotFoundError("Role assignment not found in this organization");
    const role = await RoleModel.findById(assignment.roleId).select("system permissionKeys").lean();
    if (role?.system === "super_admin") throw new BusinessRuleError("The Super Administrator role can't be revoked from the app");
    await SuperAdminService.assertCanManageAdminRole(actor.userId, organizationId, role?.permissionKeys);

    assignment.effectiveTo = new Date();
    await assignment.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "role-assignment.revoked",
      resourceType: "RoleAssignment",
      resourceId: assignment._id.toString(),
      after: { effectiveTo: assignment.effectiveTo },
    });

    return assignment;
  },

  /** Names of the user's roles in effect now (for display, e.g. the account menu), not for authorization. */
  async listRoleNamesForUser(userId: string, organizationId: string): Promise<string[]> {
    await connectMongoDB();
    const now = new Date();
    const assignments = await RoleAssignmentModel.find({
      userId: new Types.ObjectId(userId),
      organizationId: new Types.ObjectId(organizationId),
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }],
    })
      .select("roleId")
      .lean();
    if (assignments.length === 0) return [];
    const roles = await RoleModel.find({ _id: { $in: assignments.map((assignment) => assignment.roleId) }, status: { $ne: "inactive" } })
      .select("name")
      .lean();
    return roles.map((role) => role.name as string).sort((a, b) => a.localeCompare(b));
  },

  async listForOrganization(organizationId: string) {
    await connectMongoDB();
    const now = new Date();
    return RoleAssignmentModel.find({
      organizationId: new Types.ObjectId(organizationId),
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    })
      .sort({ createdAt: -1 })
      .lean();
  },

  /**
   * Every distinct User who already belongs to this organization (a role in
   * effect now, or a staff person record here) — the pool the "assign a role"
   * picker offers, joined with Person for a display name. A self-service
   * employee account still shows up here (it has a RoleAssignment too, via
   * its zero-permission role) — assigning it another role doesn't change
   * where it lands (self-service routing is by `User.employeeId`, not by
   * permissions), but there's no reason to hide it from the picker either.
   */
  async listOrganizationMembers(organizationId: string) {
    await connectMongoDB();
    // Includes staff with no role yet, so they can be given one.
    const userIds = await organizationUserIds(organizationId);
    const seesHidden = await viewerSeesHidden();
    const users = await UserModel.find({ _id: { $in: userIds }, employeeId: { $exists: false }, ...(seesHidden ? {} : { hiddenFromOthers: { $ne: true } }) }).lean();
    const persons = await PersonModel.find({ _id: { $in: users.map((user) => user.personId).filter(Boolean) } }).lean();
    const personById = new Map(persons.map((person) => [person._id.toString(), person]));

    return users.map((user) => ({
      userId: user._id.toString(),
      username: user.username ?? user.email ?? user._id.toString(),
      name: user.personId ? formatPersonName(personById.get(user.personId.toString())) : (user.username ?? "—"),
    }));
  },
};
