import { KeyRound, ShieldCheck, UserCog, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard } from "@/components/shared/metric-card";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { SuperAdminService, grantsAdminPower } from "@/domains/authorization/super-admin-service";
import { RoleFormDialog } from "./role-form-dialog";
import { AssignRoleDialog } from "./assign-role-dialog";
import { RevokeRoleAssignmentButton } from "./revoke-role-assignment-button";
import { CreateStaffAccountDialog } from "./create-staff-account-dialog";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccessSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("roles.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view roles and access.</p>;
  }

  const [canCreateRole, canUpdateRole, canAssign, canCreateStaffAccount] = await Promise.all([
    hasPermission("roles.create", organizationId),
    hasPermission("roles.update", organizationId),
    hasPermission("roles.assign", organizationId),
    hasPermission("staff-accounts.create", organizationId),
  ]);

  const session = await getServerSession(authOptions);
  const isSuperAdmin = await SuperAdminService.isSuperAdmin(session?.user?.id, organizationId);
  // The system role is never managed here; admin-power roles only by the Super Administrator.
  const canManageRole = (role: { system?: string | null; permissionKeys?: string[] | null }) => role.system !== "super_admin" && (isSuperAdmin || !grantsAdminPower(role.permissionKeys));

  const [roles, availablePermissions, assignments, members] = await Promise.all([
    RoleService.listCurrent(organizationId),
    RoleService.listAvailablePermissions(),
    RoleAssignmentService.listForOrganization(organizationId),
    RoleAssignmentService.listOrganizationMembers(organizationId),
  ]);

  const permissionOptions = availablePermissions.map((permission) => ({
    key: permission.key,
    description: permission.description,
    category: permission.category,
  }));
  const roleById = new Map(roles.map((role) => [role._id.toString(), role]));
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const roleOptions = roles.filter((role) => role.status !== "inactive" && canManageRole(role)).map((role) => ({ id: role._id.toString(), label: role.name }));
  const memberOptions = members.map((member) => ({ id: member.userId, label: `${member.name} (${member.username})` }));

  const membersByRoleId = new Map<string, number>();
  for (const assignment of assignments) membersByRoleId.set(assignment.roleId.toString(), (membersByRoleId.get(assignment.roleId.toString()) ?? 0) + 1);
  const peopleWithAccess = new Set(assignments.map((assignment) => assignment.userId.toString())).size;
  const activeRoles = roles.filter((role) => role.status !== "inactive");
  const unusedRoles = activeRoles.filter((role) => !membersByRoleId.has(role._id.toString())).length;
  const initials = (name: string) =>
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  const roleQuery = parseTableQuery(params, "name", "role");
  const { rows: rolePageRows } = applyTableQuery(roles, roleQuery, {
    searchFields: () => [],
    sortValues: {
      name: (role) => role.name,
      status: (role) => role.status,
    },
  });

  const assignmentQuery = parseTableQuery(params, undefined, "assignment");
  const { rows: assignmentPageRows, total: assignmentTotal } = applyTableQuery(assignments, assignmentQuery, {
    searchFields: (assignment) => [memberByUserId.get(assignment.userId.toString())?.name, roleById.get(assignment.roleId.toString())?.name],
    sortValues: {
      person: (assignment) => memberByUserId.get(assignment.userId.toString())?.name ?? "",
      role: (assignment) => roleById.get(assignment.roleId.toString())?.name ?? "",
      since: (assignment) => new Date(assignment.effectiveFrom),
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roles & access"
        description="Create custom roles with exactly the permissions they need, and assign them to people."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active roles" value={activeRoles.length} hint={`${roles.length - activeRoles.length} retired`} icon={ShieldCheck} />
        <MetricCard label="People with access" value={peopleWithAccess} hint={`${members.length} accounts in total`} icon={Users} emphasis />
        <MetricCard label="Role assignments" value={assignments.length} hint="Currently in effect" icon={UserCog} />
        <MetricCard label="Unused roles" value={unusedRoles} hint={unusedRoles ? "No one holds them" : "Every role is in use"} icon={KeyRound} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Roles</CardTitle>
            <CardDescription>What each kind of user can see and do.</CardDescription>
          </div>
          {canCreateRole && <RoleFormDialog organizationId={organizationId} availablePermissions={permissionOptions} />}
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Roles"
            sort={{
              sortBy: roleQuery.sort,
              sortDir: roleQuery.dir,
              buildHref: (sortKey) =>
                buildTableHref(
                  "/settings/access",
                  params,
                  { sort: sortKey, dir: roleQuery.sort === sortKey && roleQuery.dir === "asc" ? "desc" : "asc" },
                  "role",
                ),
            }}
            columns={[
              {
                key: "name",
                header: "Role",
                sortKey: "name",
                render: (role) => (
                  <div className="flex flex-col">
                    <span className="font-medium">{role.name}</span>
                    {role.description && <span className="line-clamp-1 max-w-md text-xs whitespace-normal text-muted-foreground">{role.description}</span>}
                  </div>
                ),
              },
              {
                key: "permissions",
                header: "Permissions",
                render: (role) => {
                  if (role.system === "super_admin") {
                    return <span className="text-xs font-medium text-primary">All permissions, including delete</span>;
                  }
                  // Count only what the editor offers, so a stray key can never read "126 of 125".
                  const offered = new Set(availablePermissions.map((permission) => permission.key));
                  const granted = role.permissionKeys.filter((key: string) => offered.has(key)).length;
                  const share = offered.size ? granted / offered.size : 0;
                  return (
                    <div className="flex w-36 flex-col gap-1">
                      <span className="text-xs tabular-nums">
                        <span className="font-medium">{granted}</span>
                        <span className="text-muted-foreground"> of {availablePermissions.length}</span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "members",
                header: "Members",
                className: "text-right",
                render: (role) => <span className="font-medium tabular-nums">{membersByRoleId.get(role._id.toString()) ?? 0}</span>,
              },
              { key: "status", header: "Status", sortKey: "status", render: (role) => <StatusBadge status={role.status} /> },
              {
                key: "action",
                header: "",
                render: (role) =>
                  canUpdateRole && canManageRole(role) ? (
                    <RoleFormDialog
                      organizationId={organizationId}
                      availablePermissions={permissionOptions}
                      initialValue={{
                        id: role._id.toString(),
                        name: role.name,
                        description: role.description,
                        permissionKeys: role.permissionKeys,
                        status: role.status as "active" | "inactive",
                      }}
                    />
                  ) : null,
              },
            ]}
            rows={rolePageRows}
            getRowKey={(role) => role._id.toString()}
            emptyMessage="No roles yet."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Access</CardTitle>
            <CardDescription>Who holds which role, and since when.</CardDescription>
          </div>
          {canAssign && <AssignRoleDialog organizationId={organizationId} members={memberOptions} roles={roleOptions} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TableSearchInput placeholder="Search by person or role…" paramName="assignmentQ" pageParamName="assignmentPage" />
          <DataTable
            caption="Role assignments"
            sort={{
              sortBy: assignmentQuery.sort,
              sortDir: assignmentQuery.dir,
              buildHref: (sortKey) =>
                buildTableHref(
                  "/settings/access",
                  params,
                  { sort: sortKey, dir: assignmentQuery.sort === sortKey && assignmentQuery.dir === "asc" ? "desc" : "asc", page: undefined },
                  "assignment",
                ),
            }}
            pagination={{
              page: assignmentQuery.page,
              pageSize: assignmentQuery.pageSize,
              total: assignmentTotal,
              buildHref: (page, pageSize) => buildTableHref("/settings/access", params, { page, pageSize }, "assignment"),
            }}
            columns={[
              {
                key: "person",
                header: "Person",
                sortKey: "person",
                render: (assignment) => {
                  const member = memberByUserId.get(assignment.userId.toString());
                  const name = member?.name ?? "—";
                  return (
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                        {initials(name)}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{name}</span>
                        {member?.username && <span className="truncate text-xs text-muted-foreground">@{member.username}</span>}
                      </span>
                    </div>
                  );
                },
              },
              {
                key: "role",
                header: "Role",
                sortKey: "role",
                render: (assignment) => {
                  const role = roleById.get(assignment.roleId.toString());
                  return role ? <StatusBadge status="role" label={role.name} tone="info" /> : "—";
                },
              },
              {
                key: "since",
                header: "Since",
                sortKey: "since",
                render: (assignment) => new Date(assignment.effectiveFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
              },
              {
                key: "action",
                header: "",
                render: (assignment) =>
                  canAssign && canManageRole(roleById.get(assignment.roleId.toString()) ?? {}) ? <RevokeRoleAssignmentButton id={assignment._id.toString()} organizationId={organizationId} /> : null,
              },
            ]}
            rows={assignmentPageRows}
            getRowKey={(assignment) => assignment._id.toString()}
            emptyMessage={assignmentQuery.q ? "No role assignments match this search." : "No role assignments yet."}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Staff accounts</CardTitle>
            <CardDescription>Logins for HR and admin staff.</CardDescription>
          </div>
          {canCreateStaffAccount && <CreateStaffAccountDialog organizationId={organizationId} roles={roleOptions} />}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Create an additional HR/admin login for someone who isn&apos;t clocking in/out through self-service — e.g. a Building
            Administrator who needs to manage employee records.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
