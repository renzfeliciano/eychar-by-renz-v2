import { organizationUserIds } from "./user-directory";
import { randomInt } from "crypto";
import { Types } from "mongoose";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { AuditService } from "@/server/audit/audit-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { checkPassword } from "@/shared/validation/password-policy";
import type { ChangePasswordInput } from "@/shared/validation/auth";
import { formatPersonName } from "@/lib/person-name";
import { auditUserEvent } from "./user-audit";

export type AccountStatus = "active" | "disabled";

export type AccountSummary = {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  kind: "staff" | "self-service";
  /** Distinct permissions the account's active roles grant (delete permissions excluded: they're the Super Administrator's alone). */
  permissionCount: number;
  isSuperAdmin: boolean;
  roleNames: string[];
  status: AccountStatus;
  locked: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastSignInAt: Date | null;
  createdAt: Date | null;
};

// No look-alike characters (0/o, 1/l/i), so a temporary password read out
// over the phone or copied by hand survives.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function temporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("");
  return [group(), group(), group(), group()].join("-");
}

/** User ids that belong to the organization: anyone with a role there, or a self-service account of one of its employees. */
async function requireUserInOrganization(userId: string, organizationId: string) {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(userId)) throw new NotFoundError("Account not found in this organization");
  const ids = await organizationUserIds(organizationId);
  if (!ids.some((id) => id.toString() === userId)) throw new NotFoundError("Account not found in this organization");
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new NotFoundError("Account not found in this organization");
  return user;
}

/**
 * The account lifecycle: people changing their own password, and
 * administrators resetting passwords, disabling accounts and seeing each
 * account's security state. Every change is audited.
 */
export const AccountSecurityService = {
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    await connectMongoDB();
    const user = await UserModel.findById(userId).lean();
    if (!user) throw new NotFoundError("Account not found");
    if (!(await argon2.verify(user.passwordHash, input.currentPassword))) throw new ValidationError("Your current password is incorrect.");
    const problems = checkPassword(input.newPassword, { username: user.username, email: user.email });
    if (problems.length > 0) throw new ValidationError(problems.join(" "));

    await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: await argon2.hash(input.newPassword), passwordChangedAt: new Date(), mustChangePassword: false } });
    await auditUserEvent(userId, "auth.password-changed");
  },

  /** A temporary password, shown once to the administrator; the person must replace it at next sign-in. */
  async resetPassword(userId: string, organizationId: string, actor: { userId?: string }): Promise<{ temporaryPassword: string }> {
    const user = await requireUserInOrganization(userId, organizationId);
    const password = temporaryPassword();
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash: await argon2.hash(password), mustChangePassword: true, passwordChangedAt: new Date(), failedSignInCount: 0 },
        // Signs out any open session and clears a lock.
        $unset: { activeSessionId: 1, lockedUntil: 1 },
      },
    );
    await auditUserEvent(userId, "auth.password-reset", {}, actor.userId);
    return { temporaryPassword: password };
  },

  async setStatus(userId: string, organizationId: string, status: AccountStatus, actor: { userId?: string }): Promise<void> {
    const user = await requireUserInOrganization(userId, organizationId);
    if (actor.userId && actor.userId === userId && status === "disabled") throw new ValidationError("You can't disable your own account.");
    await UserModel.updateOne({ _id: user._id }, status === "disabled" ? { $set: { status }, $unset: { activeSessionId: 1 } } : { $set: { status } });
    await auditUserEvent(userId, status === "disabled" ? "auth.account-disabled" : "auth.account-enabled", {}, actor.userId);
  },

  requireUserInOrganization,

  async listForOrganization(organizationId: string, now: Date = new Date()): Promise<AccountSummary[]> {
    await connectMongoDB();
    const ids = await organizationUserIds(organizationId);
    const users = await UserModel.find({ _id: { $in: ids } })
      .select("username email personId employeeId status lockedUntil mfa.enabled mustChangePassword lastSignInAt createdAt")
      .lean();

    const employees = await EmployeeModel.find({ _id: { $in: users.map((user) => user.employeeId).filter(Boolean) } }).select("personId").lean();
    const personIdByEmployee = new Map(employees.map((employee) => [employee._id.toString(), employee.personId.toString()]));
    const personIds = users.map((user) => user.personId?.toString() ?? (user.employeeId ? personIdByEmployee.get(user.employeeId.toString()) : undefined)).filter(Boolean);
    const persons = await PersonModel.find({ _id: { $in: personIds } }).lean();
    const personById = new Map(persons.map((person) => [person._id.toString(), person]));

    const assignments = await RoleAssignmentModel.find({ organizationId: new Types.ObjectId(organizationId), userId: { $in: ids } }).select("userId roleId effectiveTo").lean();
    const roles = await RoleModel.find({ _id: { $in: assignments.map((assignment) => assignment.roleId) } }).select("name permissionKeys system status").lean();
    const roleNameById = new Map(roles.map((role) => [role._id.toString(), role.name as string]));
    const roleById = new Map(roles.map((role) => [role._id.toString(), role]));
    const roleNamesByUser = new Map<string, string[]>();
    const permissionsByUser = new Map<string, Set<string>>();
    const superAdminUsers = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.effectiveTo && new Date(assignment.effectiveTo) <= now) continue;
      const name = roleNameById.get(assignment.roleId.toString());
      if (!name) continue;
      const key = assignment.userId.toString();
      const role = roleById.get(assignment.roleId.toString());
      if (role?.system === "super_admin") superAdminUsers.add(key);
      if (role && role.status !== "inactive") {
        const granted = permissionsByUser.get(key) ?? new Set<string>();
        for (const permission of (role.permissionKeys ?? []) as string[]) if (!permission.endsWith(".delete")) granted.add(permission);
        permissionsByUser.set(key, granted);
      }
      roleNamesByUser.set(key, [...(roleNamesByUser.get(key) ?? []), name]);
    }

    return users
      .map((user) => {
        const personId = user.personId?.toString() ?? (user.employeeId ? personIdByEmployee.get(user.employeeId.toString()) : undefined);
        const person = personId ? personById.get(personId) : undefined;
        return {
          id: user._id.toString(),
          username: user.username ?? null,
          email: user.email ?? null,
          displayName: person ? formatPersonName(person) : (user.username ?? user.email ?? "Unnamed account"),
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
          kind: user.employeeId ? ("self-service" as const) : ("staff" as const),
          permissionCount: permissionsByUser.get(user._id.toString())?.size ?? 0,
          isSuperAdmin: superAdminUsers.has(user._id.toString()),
          roleNames: (roleNamesByUser.get(user._id.toString()) ?? []).sort((a, b) => a.localeCompare(b)),
          status: user.status as AccountStatus,
          locked: Boolean(user.lockedUntil && new Date(user.lockedUntil) > now),
          mfaEnabled: Boolean(user.mfa?.enabled),
          mustChangePassword: Boolean(user.mustChangePassword),
          lastSignInAt: user.lastSignInAt ?? null,
          createdAt: user.createdAt ?? null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  /** Only the Super Administrator can act on the Super Administrator's own account (rename, reset, disable…). */
  async assertCanAdminister(targetUserId: string, organizationId: string, actor: { userId?: string }) {
    if (!(await SuperAdminService.isSuperAdmin(targetUserId, organizationId))) return;
    if (actor.userId !== targetUserId) throw new AuthorizationError("Only the Super Administrator can change the Super Administrator's account");
  },

  /** Renames a staff account (its person record). Employees' names are changed on their profile instead. */
  async rename(targetUserId: string, organizationId: string, input: { firstName: string; lastName: string }, actor: { userId?: string }) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new ValidationError("Enter both a first and a last name");
    const user = await requireUserInOrganization(targetUserId, organizationId);
    await AccountSecurityService.assertCanAdminister(targetUserId, organizationId, actor);
    if (user.employeeId) throw new BusinessRuleError("This is an employee's account; change their name on their profile in People");

    let before: { firstName?: string; lastName?: string } = {};
    if (user.personId) {
      const person = await PersonModel.findById(user.personId);
      if (!person) throw new NotFoundError("Account person record not found");
      before = { firstName: person.firstName, lastName: person.lastName };
      person.firstName = firstName;
      person.lastName = lastName;
      await person.save();
    } else {
      const person = await PersonModel.create({ organizationId: new Types.ObjectId(organizationId), firstName, lastName });
      await UserModel.updateOne({ _id: user._id }, { $set: { personId: person._id } });
    }

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "account.renamed",
      resourceType: "User",
      resourceId: targetUserId,
      before,
      after: { firstName, lastName },
    });
  },
};
