import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel, UserModel } from "@/server/db/models";
import { OrganizationService } from "@/domains/organization/organization-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { formatPersonName } from "@/lib/person-name";
import { hasPermission } from "@/app/_shared/has-permission";
import { WorkspaceLayout } from "@/components/shared/workspace-layout";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { IdleSessionGuard } from "@/components/shared/idle-session-guard";
import { getSession } from "@/server/auth/session";
import { heldPermissions, keysInAnyScope } from "@/server/authorization";

// Everything here is behind sign-in and holds personal data: never list it in search.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // A self-service employee account has no business in the HR admin
  // shell — send it straight to the clock-in/out portal instead.
  await connectMongoDB();
  const user = await UserModel.findById(session.user.id).select("employeeId username email personId mustChangePassword").lean();
  // A temporary password (new account or an HR reset) must be replaced before anything else.
  if (user?.mustChangePassword) redirect("/change-password");
  if (user?.employeeId) redirect("/clock");
  // The organization requires two-step for staff accounts and this one hasn't set it up yet.
  if (session.mustSetUpTwoStep) redirect("/set-up-two-step");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  const organization = organizations[0];
  const organizationId = organization?._id.toString();

  const [person, roleNames, canManageAccess, isSuperAdmin, held] = await Promise.all([
    user?.personId ? PersonModel.findById(user.personId).lean() : null,
    organizationId ? RoleAssignmentService.listRoleNamesForUser(session.user.id, organizationId) : [],
    organizationId ? hasPermission("roles.read", organizationId) : false,
    organizationId ? SuperAdminService.isSuperAdmin(session.user.id, organizationId) : false,
    // Same per-render cached grants every page's hasPermission() reads — no extra queries.
    organizationId ? heldPermissions({ userId: session.user.id, organizationId }) : { superAdmin: false, keys: new Set<string>(), projectKeys: new Map<string, Set<string>>() },
  ]);
  const security = await SecuritySettingsService.forUser(session.user.id);
  const displayName = person ? formatPersonName(person) : (session.user.name ?? user?.username ?? session.user.email ?? "User");

  return (
    <WorkspaceLayout
      isSuperAdmin={isSuperAdmin}
      // The super_admin system role passes every permission check, so nothing to filter.
      // Project-scoped grants count for navigation (a Project Manager still sees Projects); each page re-checks server-side.
      heldPermissions={held.superAdmin ? undefined : [...keysInAnyScope(held)]}
      account={{
        displayName,
        username: user?.username ?? null,
        email: user?.email ?? null,
        organizationName: organization?.name ?? "No organization",
        roleNames,
        canManageAccess,
      }}
    >
      <ConcurrentSessionGuard />
      <IdleSessionGuard idleMs={security.idleTimeoutSeconds * 1000} warningMs={security.idleWarningSeconds * 1000} />
      {children}
    </WorkspaceLayout>
  );
}
