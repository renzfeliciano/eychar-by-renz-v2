import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PersonModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { formatPersonName } from "@/lib/person-name";

/** A role assignment in effect now: started, and not yet ended (revoked or expired). */
export function activeRoleAssignment(now: Date = new Date()) {
  return { effectiveFrom: { $lte: now }, $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gt: now } }] };
}

/**
 * Every organization an account is tied to: where it holds a role now, its
 * self-service employee's employer, and its staff person record's
 * organization. Used to tell whether an administrator of one organization
 * would, by acting on the account, reach into another.
 */
export async function organizationIdsForUser(userId: string): Promise<Set<string>> {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(userId)) return new Set();
  const user = await UserModel.findById(userId).select("employeeId personId").lean();
  if (!user) return new Set();
  const [fromRoles, employee, person] = await Promise.all([
    RoleAssignmentModel.distinct("organizationId", { userId: new Types.ObjectId(userId), ...activeRoleAssignment() }),
    user.employeeId ? EmployeeModel.findById(user.employeeId).select("organizationId").lean() : null,
    user.personId ? PersonModel.findById(user.personId).select("organizationId").lean() : null,
  ]);
  const ids = new Set<string>(fromRoles.map(String));
  if (employee?.organizationId) ids.add(employee.organizationId.toString());
  if (person?.organizationId) ids.add(person.organizationId.toString());
  return ids;
}

/** Whether the account already belongs to the organization (same rules as organizationUserIds). */
export async function userBelongsToOrganization(userId: string, organizationId: string): Promise<boolean> {
  return (await organizationIdsForUser(userId)).has(organizationId);
}

/**
 * Every account that belongs to an organization: anyone with a role there,
 * any employee's self-service account, and any staff account whose person
 * record is the organization's (a staff account created with "assign a role
 * later" has only that link, and would otherwise be invisible everywhere).
 */
export async function organizationUserIds(organizationId: string): Promise<Types.ObjectId[]> {
  await connectMongoDB();
  const orgId = new Types.ObjectId(organizationId);
  const [fromRoles, employeeIds, personIds] = await Promise.all([
    // Only roles in effect now: a revoked or expired assignment no longer ties the account here.
    RoleAssignmentModel.distinct("userId", { organizationId: orgId, ...activeRoleAssignment() }),
    EmployeeModel.find({ organizationId: orgId }).distinct("_id"),
    PersonModel.find({ organizationId: orgId }).distinct("_id"),
  ]);
  const linked = await UserModel.find({ $or: [{ employeeId: { $in: employeeIds } }, { personId: { $in: personIds } }] }).distinct("_id");
  const unique = new Map([...fromRoles, ...linked].map((id: Types.ObjectId) => [id.toString(), id]));
  return [...unique.values()];
}

/**
 * Display names for user ids (who prepared, approved, released …): the
 * linked person's name when there is one, else the username or email.
 * Missing ids simply don't appear in the map.
 */
export async function userDisplayNames(userIds: (string | Types.ObjectId | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return new Map();
  await connectMongoDB();

  const users = await UserModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
    .select("username email personId")
    .lean();
  const persons = await PersonModel.find({ _id: { $in: users.map((user) => user.personId).filter(Boolean) } }).lean();
  const personById = new Map(persons.map((person) => [person._id.toString(), person]));

  return new Map(
    users.map((user) => {
      const person = user.personId ? personById.get(user.personId.toString()) : undefined;
      return [user._id.toString(), person ? formatPersonName(person) : (user.username ?? user.email ?? "Unknown user")];
    }),
  );
}
