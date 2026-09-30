import { organizationUserIds } from "./user-directory";
import { randomInt } from "crypto";
import { Types } from "mongoose";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { NotFoundError, ValidationError } from "@/shared/errors";
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
  kind: "staff" | "self-service";
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
    const roles = await RoleModel.find({ _id: { $in: assignments.map((assignment) => assignment.roleId) } }).select("name").lean();
    const roleNameById = new Map(roles.map((role) => [role._id.toString(), role.name as string]));
    const roleNamesByUser = new Map<string, string[]>();
    for (const assignment of assignments) {
      if (assignment.effectiveTo && new Date(assignment.effectiveTo) <= now) continue;
      const name = roleNameById.get(assignment.roleId.toString());
      if (!name) continue;
      const key = assignment.userId.toString();
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
          kind: user.employeeId ? ("self-service" as const) : ("staff" as const),
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
};
