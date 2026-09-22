import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const roleOptions = roles.filter((role) => role.status !== "inactive").map((role) => ({ id: role._id.toString(), label: role.name }));
  const memberOptions = members.map((member) => ({ id: member.userId, label: `${member.name} (${member.username})` }));

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Roles</CardTitle>
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
              { key: "name", header: "Name", sortKey: "name", render: (role) => <span className="font-medium">{role.name}</span> },
              { key: "description", header: "Description", render: (role) => role.description || "—" },
              { key: "permissions", header: "Permissions", render: (role) => `${role.permissionKeys.length} granted` },
              { key: "status", header: "Status", sortKey: "status", render: (role) => <StatusBadge status={role.status} /> },
              {
                key: "action",
                header: "",
                render: (role) =>
                  canUpdateRole ? (
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
          <CardTitle className="text-base">Access</CardTitle>
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
                render: (assignment) => memberByUserId.get(assignment.userId.toString())?.name ?? "—",
              },
              {
                key: "role",
                header: "Role",
                sortKey: "role",
                render: (assignment) => roleById.get(assignment.roleId.toString())?.name ?? "—",
              },
              {
                key: "since",
                header: "Since",
                sortKey: "since",
                render: (assignment) => new Date(assignment.effectiveFrom).toLocaleDateString(),
              },
              {
                key: "action",
                header: "",
                render: (assignment) =>
                  canAssign ? <RevokeRoleAssignmentButton id={assignment._id.toString()} organizationId={organizationId} /> : null,
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
          <CardTitle className="text-base">Staff accounts</CardTitle>
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
