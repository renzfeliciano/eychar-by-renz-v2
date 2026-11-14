# Authorization (roles, scoped grants, Super Administrator)

**Purpose:** Decides what each signed-in user may do, per organization and optionally per project, through database-held roles and assignments. Also manages roles and role assignments.
**Governing docs:** ADR-007 (scoped, database-driven RBAC); ADR-023 (custom roles and staff accounts); ADR-043 (project-scoped assignments); ADR-039 (two-step per account type); ADR-010 (session); ARCHITECTURE.md § Authorization (ADR-007), § Custom roles & staff accounts (ADR-023); ENGINEERING.md §§ 19-23 (identity, RBAC, role assignment, scoped authorization, UI authorization), § 60 (required authorization test).

**Services:**
- `src/server/authorization/authorize.ts`: the chokepoint.
  - `authorize({ userId, organizationId, permission, projectId? })`: throws `AuthorizationError` unless a grant covers it.
  - `accessibleProjectIds(...)`: `"all"` or the project ids the user holds the permission on (for list endpoints).
  - `includesProject`, `hasActiveRoleAssignment` (membership only), `heldPermissions`, `keysInAnyScope` (UI hints only), `missingGrants` (escalation check).
  - Private `activeGrants`, React `cache`d per render.
- `src/server/authorization/require.ts`: route and page primitives.
  - `requireAuthenticatedUser`, `requireOrganizationAccess` (no callers in `src/`), `requirePermission`, `requireProjectAccess`, `requireAccessibleProjects`, `requireSelfServiceEmployee`.
- `src/server/authorization/index.ts`: re-exports both files.
- `src/app/_shared/has-permission.ts`: `hasPermission(permission, orgId)`, the boolean wrapper pages use.
- `src/domains/authorization/role-service.ts`: `RoleService`: `create`, `update`, `listCurrent`, `getById`, `listAvailablePermissions`.
- `src/domains/authorization/role-assignment-service.ts`: `RoleAssignmentService`: `assertCanGrant`, `assign`, `revoke`, `listRoleNamesForUser`, `listForOrganization`, `listOrganizationMembers`.
- `src/domains/authorization/super-admin-service.ts`: `SuperAdminService`: `isSuperAdmin`, `isSuperAdminAnywhere`, `ensure` (seed only), `assertCanManageAdminRole`. Helpers: `ADMIN_PERMISSION_KEYS`, `isDeletePermission`, `isReservedRoleName`, `grantsAdminPower`.

**Models:**
- `Role`: `src/server/db/models/role.ts` (`system`, `permissionKeys`, `status`).
- `RoleAssignment`: `src/server/db/models/role-assignment.ts` (`scope`, `effectiveFrom`, `effectiveTo`).
- `Permission`: `src/server/db/models/permission.ts` (global seeded catalog).
- `User`: `src/server/db/models/user.ts` (`employeeId`, `personId` links used by self-service and clearance).

**Permission catalog and seeding:** `scripts/seed.ts` (permission array, e.g. `clearance.*` at lines 204-208). The seed calls `SuperAdminService.ensure` at line 744.

**Routes:**
- `src/app/api/roles/route.ts`: GET (`roles.read`), POST (`roles.create`).
- `src/app/api/roles/[id]/route.ts`: PATCH (`roles.update`).
- `src/app/api/role-assignments/route.ts`: GET (`roles.read`), POST (`roles.assign`).
- `src/app/api/role-assignments/[id]/route.ts`: DELETE, i.e. revoke (`roles.assign`).
- Staff account creation (`src/app/api/staff-accounts/route.ts`, `staff-accounts.create`) calls `assertCanGrant` before writing; account routes belong to the identity domain.

**Pages:**
- `src/app/(app)/settings/access/page.tsx` with `assign-role-dialog.tsx`, `role-form-dialog.tsx`, `revoke-role-assignment-button.tsx`, `create-staff-account-dialog.tsx`.
- `src/app/(app)/settings/accounts/page.tsx` with `account-actions.tsx`.
- `src/app/(app)/account/security/page.tsx` (two-step and sign-in events, identity domain).

**Tests:**
- `tests/domains/authorization/`: `role-service.test.ts`, `role-assignment-service.test.ts`, `role-grant-security.test.ts`, `super-admin.test.ts`.
- `tests/server/authorization/`: `authorize.test.ts`, `project-scope.test.ts` (the ENGINEERING § 60 matrix), `holiday-event-permission.test.ts`, `require-password-change.test.ts`.
- `tests/app/nav-permissions.test.tsx` (navigation visibility).

**Rules a change must respect:**
- Check permissions only through `authorize`/`require*`. Never compare role names or `user.role` (`authorize.ts`, doc comment lines 32-38). Keys are literal `<resource>.<verb>` strings.
- A grant is active only if its assignment is in effect (`effectiveFrom <= now`, `effectiveTo` absent, null or `>= now`) and its role is `active` or has no status field (`authorize.ts`, `activeGrants`, lines 97-116).
- Scope: an organization-scope grant passes every check. A project-scope grant passes only when `authorize` receives a `projectId` that is in its `projectIds` (`authorize.ts` lines 39-47). Assignments with no scope are organization-wide (`scopeOf`, lines 79-84). An unknown scope type grants nothing.
- Project ids are validated against the organization before use: `requireProjectAccess` (`require.ts` lines 272-276) and `assertScopeInOrganization` (`role-assignment-service.ts` lines 151-157).
- The Super Administrator is a `Role` with `system: "super_admin"` in organization scope; it passes every check (`authorize.ts` lines 125-128, 41, 57). It is created only by the seed (`super-admin-service.ts` `ensure`; `scripts/seed.ts` line 744). The app refuses to edit, assign or revoke it (`role-service.ts` line 83; `role-assignment-service.ts` lines 176, 246).
- Reserved role names ("Super Administrator" and variants) are refused (`super-admin-service.ts` `isReservedRoleName`, used at `role-service.ts` lines 43 and 84).
- `*.delete` permissions cannot be put on any role and are hidden from the role editor (`role-service.ts` lines 11-13, 44, 85, 135).
- Admin-power keys (`roles.create`, `roles.update`, `roles.assign`, `users.create`, `users.update`) can be added, changed or handed out only by the Super Administrator (`super-admin-service.ts` `assertCanManageAdminRole`, called from `role-service.ts` lines 45 and 87, and `role-assignment-service.ts` lines 177 and 247).
- No escalation: a person may grant only permissions they hold at least as broadly as the grant (`role-service.ts` `assertCanAddPermissions`, lines 29-37; `role-assignment-service.ts` `assertCanGrant`, lines 182-191, via `missingGrants`). System calls with no actor skip this (`role-assignment-service.ts` line 181).
- A person may assign roles only to accounts already in the organization (`role-assignment-service.ts` lines 207-209).
- Revocation sets `effectiveTo` and keeps the row (`role-assignment-service.ts` `revoke`, lines 240-262). No hard delete.
- Self-service routes take the employee from the session via `requireSelfServiceEmployee` (`require.ts` lines 298-309), never from the request body.
- While a password change or two-step setup is pending, `requireAuthenticatedUser` refuses every route except those that opt in (`require.ts` lines 236-242).
- `keysInAnyScope` is for navigation hints only, not for security decisions (`authorize.ts` line 178).
- Each role change and grant is audited: `role.created`, `role.updated`, `role-assignment.created`, `role-assignment.revoked`.

**Known gaps / mismatches:**
- **Membership ignores role status.** `hasActiveRoleAssignment` (`authorize.ts` lines 147-162) checks only the assignment dates, while `activeGrants` (line 113) also requires the role to be active. An inactive role still counts as membership. `requireOrganizationAccess` is the only caller of `hasActiveRoleAssignment` and has no callers in `src/`, so the gap is latent.
- **Expiry boundary differs.** `listRoleNamesForUser` uses `effectiveTo > now` (`role-assignment-service.ts` line 271); `activeGrants` uses `>= now` (`authorize.ts` line 102). Display only, but the two should agree.
- **Project scope is partial.** ARCHITECTURE.md § Authorization and ADR-043 say attendance, projects and payroll runs are project-scoped. Only the list routes honour it, for attendance (see the attendance file). Other modules use organization-wide checks, which ARCHITECTURE.md already lists as a gap.
- **ENGINEERING § 60 matrix** is covered for `authorize` and project scope (`tests/server/authorization/project-scope.test.ts`). No matrix test exists for role-assignment escalation through the API routes.
- Two-step is per account type, not per role (ADR-039; ARCHITECTURE.md Known gaps). The gate is the session flag `mustSetUpTwoStep` (`require.ts` line 240).

**Last verified:** 6587050.
