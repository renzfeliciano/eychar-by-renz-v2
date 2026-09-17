import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, UserModel } from "@/server/db/models";
import { AuthenticationError, AuthorizationError } from "@/shared/errors";
import { authorize, hasActiveRoleAssignment } from "./authorize";

/**
 * Resolves the authenticated user from the server-side session only.
 * Authentication (who is this?) is intentionally kept separate from
 * authorization (what can they do?) — see AGENTS.md §19.
 */
export async function requireAuthenticatedUser(): Promise<{ userId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AuthenticationError();
  return { userId: session.user.id };
}

/**
 * Any active role assignment in the organization is sufficient for "access"
 * to the organization itself (e.g. selecting it as context); specific
 * operations still go through requirePermission.
 */
export async function requireOrganizationAccess(organizationId: string): Promise<{ userId: string }> {
  const { userId } = await requireAuthenticatedUser();
  const isMember = await hasActiveRoleAssignment({ userId, organizationId });
  if (!isMember) throw new AuthorizationError("No active role assignment in this organization");
  return { userId };
}

export async function requirePermission(
  permission: string,
  organizationId: string,
): Promise<{ userId: string }> {
  const { userId } = await requireAuthenticatedUser();
  await authorize({ userId, organizationId, permission });
  return { userId };
}

/**
 * For self-service API routes only (attendance clock-in/out, WebAuthn
 * ceremonies) — resolves the session's own employeeId from its linked
 * User record, never from a client-supplied id, and rejects an HR/admin
 * account (no employeeId) the same as an unauthenticated one.
 */
export async function requireSelfServiceEmployee(): Promise<{ userId: string; employeeId: string; organizationId: string }> {
  const { userId } = await requireAuthenticatedUser();

  await connectMongoDB();
  const user = await UserModel.findById(userId).lean();
  if (!user?.employeeId) throw new AuthorizationError("This account has no self-service employee access");

  const employee = await EmployeeModel.findById(user.employeeId).lean();
  if (!employee) throw new AuthorizationError("Linked employee record not found");

  return { userId, employeeId: employee._id.toString(), organizationId: employee.organizationId.toString() };
}
