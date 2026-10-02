# ADR-043: Project-scoped role assignments

## Status

Accepted. Extends ADR-007 (scoped RBAC) and ADR-023 (custom roles).

## Context

Every role assignment applied to the whole organization. AGENTS.md §21–22 and the required
authorization test (§60) need a Project Manager who can act on Project A and not on Project B,
checked on the server. `RoleAssignment.scope` was already a discriminated shape
(`{ type: "organization" }`) so a new kind could be added without a migration.

## Decision

- **Model:** `scope` is `{ type: "organization" }` or `{ type: "project", projectIds: ObjectId[] }`.
  One assignment lists all its projects (a manager over three sites is one grant, revoked and
  audited as one). Documents written before scopes existed (no `scope`, or no `scope.type`) are
  organization-wide, as they always were. An unknown scope type grants nothing (fails closed).
- **Checks** (`src/server/authorization/authorize.ts`):
  - `authorize({ …, projectId })`: an organization-wide grant passes for any project; a project
    grant passes only when `projectId` names one of its projects. Without a `projectId`, only
    organization-wide grants count, so a project-scoped holder never passes an organization-wide
    check such as "list every employee".
  - `accessibleProjectIds()` returns `"all"` or the caller's project ids, for list endpoints that
    filter instead of refusing.
  - `requireProjectAccess(permission, organizationId, projectId)` and
    `requireAccessibleProjects(permission, organizationId)` in `require.ts`, with the same
    temporary-password and required-two-step rules as the other guards. Both check the project
    belongs to the organization (another tenant's id reads as not found).
  - Grants are still resolved once per server render (React `cache()`), never across requests.
- **Granting:** `assertCanGrant` uses `missingGrants()`: an organization-wide grant needs the giver
  to hold those permissions organization-wide; a grant on projects needs them organization-wide or
  on each of those projects. A project-scoped manager can only hand out access within their own
  projects. Account administration (`assertCanAdminister`) compares grants project by project the
  same way. Editing a role (which changes it for every holder) still needs the keys
  organization-wide.
- **Where it applies now:**
  - Attendance list: one employee's history needs organization-wide access; `?projectId=` needs
    access to that project; otherwise results are filtered to the caller's projects.
  - Projects: the list shows a project-scoped reader only their projects; editing a project's
    details accepts project-scoped `projects.update`; opening, closing or deactivating stays
    organization-wide.
  - Payroll runs list: a project-scoped reader sees only their projects' runs.
  - Navigation shows a module when a permission is held in any scope (UI hint only).
- **UI:** Settings › Roles & access › Assign role has "Applies to: Whole organization / Specific projects";
  the assignments table shows the scope.

## Consequences

- The §60 matrix is a test (`tests/server/authorization/project-scope.test.ts`), along with
  expired assignments, removed permissions, legacy documents and cross-organization ids.
- Other modules still use organization-wide checks, which is the safe default: a project-scoped
  holder is refused, not over-granted. Move a module to `requireProjectAccess` /
  `requireAccessibleProjects` when a real project-level role needs it (likely next: schedules,
  leave approval for a project's staff, project dashboards).
- Organization-unit scope can be added the same way (`{ type: "organizationUnit", unitIds }`).
