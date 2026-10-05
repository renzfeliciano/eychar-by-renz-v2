import type { Metadata } from "next";

import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SuperAdminService, grantsAdminPower } from "@/domains/authorization/super-admin-service";
import { RoleFormDialog } from "./role-form-dialog";
import { AssignRoleDialog } from "./assign-role-dialog";
import { RevokeRoleAssignmentButton } from "./revoke-role-assignment-button";
import { CreateStaffAccountDialog } from "./create-staff-account-dialog";
import { getSession } from "@/server/auth/session";
import { NoAccessState } from "@/components/shared/no-access-state";
import { formatDate } from "@/lib/app-time";

export const metadata: Metadata = { title: "Roles & access" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AccessSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("roles.read", organizationId))) {
    return <NoAccessState permission="roles.read" message="You don't have access to view roles and access." />;
  }

  const [canCreateRole, canUpdateRole, canAssign, canCreateStaffAccount] = await Promise.all([
    hasPermission("roles.create", organizationId),
    hasPermission("roles.update", organizationId),
    hasPermission("roles.assign", organizationId),
    hasPermission("staff-accounts.create", organizationId),
  ]);

  const session = await getSession();
  const isSuperAdmin = await SuperAdminService.isSuperAdmin(session?.user?.id, organizationId);
  // The system role is never managed here; admin-power roles only by the Super Administrator.
  const canManageRole = (role: { system?: string | null; permissionKeys?: string[] | null }) => role.system !== "super_admin" && (isSuperAdmin || !grantsAdminPower(role.permissionKeys));

  const [roles, availablePermissions, assignments, members, projects] = await Promise.all([
    RoleService.listCurrent(organizationId),
    RoleService.listAvailablePermissions(),
    RoleAssignmentService.listForOrganization(organizationId),
    RoleAssignmentService.listOrganizationMembers(organizationId),
    ProjectService.listCurrent(organizationId),
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
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name as string]));
  const projectOptions = projects
    .filter((project) => project.status === "active")
    .map((project) => ({ id: project._id.toString(), label: project.name as string }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Where an assignment applies; one written before scopes existed is organization-wide.
  const scopeLabel = (assignment: (typeof assignments)[number]) => {
    const scope = assignment.scope as { type?: string; projectIds?: { toString(): string }[] } | undefined;
    if (scope?.type !== "project") return null;
    return (scope.projectIds ?? []).map((id) => projectNameById.get(id.toString()) ?? "Unknown project");
  };

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
    searchFields: (assignment) => [memberByUserId.get(assignment.userId.toString())?.name, roleById.get(assignment.roleId.toString())?.name, ...(scopeLabel(assignment) ?? [])],
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

      <MetricStrip columns={4}>
        <MetricCard label="Active roles" value={activeRoles.length} hint={`${roles.length - activeRoles.length} retired`} />
        <MetricCard label="People with access" value={peopleWithAccess} hint={`${members.length} accounts in total`} emphasis />
        <MetricCard label="Role assignments" value={assignments.length} hint="Currently in effect" />
        <MetricCard label="Unused roles" value={unusedRoles} hint={unusedRoles ? "No one holds them" : "Every role is in use"} />
      </MetricStrip>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Roles</CardTitle>
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
                header: "Permissions", mobile: "subtitle",
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
            <CardTitle>Access</CardTitle>
            <CardDescription>Who holds which role, where it applies, and since when.</CardDescription>
          </div>
          {canAssign && <AssignRoleDialog organizationId={organizationId} members={memberOptions} roles={roleOptions} projects={projectOptions} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TableSearchInput placeholder="Search by person, role or project…" paramName="assignmentQ" pageParamName="assignmentPage" />
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
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground ring-1 ring-border" aria-hidden="true">
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
                key: "scope",
                header: "Applies to",
                render: (assignment) => {
                  const projectNames = scopeLabel(assignment);
                  if (!projectNames) return <span className="text-muted-foreground">Whole organization</span>;
                  return (
                    <span className="line-clamp-2 max-w-xs text-sm whitespace-normal" title={projectNames.join(", ")}>
                      <span className="sr-only">Projects: </span>
                      {projectNames.join(", ")}
                    </span>
                  );
                },
              },
              {
                key: "since",
                header: "Since",
                sortKey: "since",
                render: (assignment) => formatDate(assignment.effectiveFrom),
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
            <CardTitle>Staff accounts</CardTitle>
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
