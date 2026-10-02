import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, ProjectModel, UserModel } from "@/server/db/models";
import { AuthenticationError, AuthorizationError } from "@/shared/errors";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { accessibleProjectIds, authorize, hasActiveRoleAssignment, type AccessibleProjects } from "./authorize";
import { getSession } from "@/server/auth/session";

export const PENDING_PASSWORD_CHANGE_MESSAGE = "Choose a new password before continuing: you signed in with a temporary one.";

export const PENDING_TWO_STEP_MESSAGE = "Your organization requires two-step verification. Set it up under Account › Security to continue.";

export type RequireAuthenticatedUserOptions = {
  /**
   * Lets a staff account that still has to set up required two-step
   * verification through. Only for the routes that set it up
   * (POST /api/account/mfa) and change the password.
   */
  allowPendingTwoStepSetup?: boolean;
  /**
   * Lets an account still on a temporary password through. Only for the
   * route that replaces that password (POST /api/account/password); every
   * other route refuses it until the password is changed.
   */
  allowPendingPasswordChange?: boolean;
};

/**
 * Resolves the authenticated user from the server-side session only.
 * Authentication (who is this?) is intentionally kept separate from
 * authorization (what can they do?) — see AGENTS.md §19. An account that
 * must replace a temporary password (new, or reset by an administrator) is
 * refused everywhere else until it has, not just redirected by the pages.
 */
export async function requireAuthenticatedUser(options: RequireAuthenticatedUserOptions = {}): Promise<{ userId: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthenticationError();
  if (session.mustChangePassword && !options.allowPendingPasswordChange) throw new AuthorizationError(PENDING_PASSWORD_CHANGE_MESSAGE);
  if (session.mustSetUpTwoStep && !options.allowPendingTwoStepSetup) throw new AuthorizationError(PENDING_TWO_STEP_MESSAGE);
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
 * A permission on one project (AGENTS.md §22 `requireProjectAccess`): passes
 * for an organization-wide grant, or a project-scoped grant naming this
 * project. The project must belong to the organization (a malformed id or
 * another organization's project reads as not found). Never trust a
 * client's `projectId` without this — switching project grants nothing.
 */
export async function requireProjectAccess(permission: string, organizationId: string, projectId: string): Promise<{ userId: string }> {
  const { userId } = await requireAuthenticatedUser();
  await authorize({ userId, organizationId, permission, projectId });
  await assertInOrganization(ProjectModel, projectId, organizationId, "Project");
  return { userId };
}

/**
 * For list endpoints over project-scoped data: passes when the user holds
 * `permission` organization-wide (`projects: "all"`) or for at least one
 * project (`projects`: those ids — the caller MUST filter to them). Refuses
 * when they hold it nowhere.
 */
export async function requireAccessibleProjects(permission: string, organizationId: string): Promise<{ userId: string; projects: AccessibleProjects }> {
  const { userId } = await requireAuthenticatedUser();
  const projects = await accessibleProjectIds({ userId, organizationId, permission });
  if (projects !== "all" && projects.length === 0) throw new AuthorizationError(`Missing permission "${permission}" in this organization`);
  return { userId, projects };
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
