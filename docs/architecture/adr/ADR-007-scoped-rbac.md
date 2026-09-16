# ADR-007: Scoped, database-driven RBAC

## Status

Accepted (foundation only — organization scope; project/unit scope deferred)

## Context

AGENTS.md §20–§22 requires RBAC resolved from data (`User` → `RoleAssignment` → `Role` →
permission keys), server-side only, with no `user.role === "..."` checks and no client-supplied
scope trusted without independent verification. §60 defines the required authorization test:
an org-wide role assignment must grant access across every project scope in that org; a
project-scoped assignment must grant access to its own project and deny every other one.

## Decision

- `authorize({ userId, organizationId, permission })` is the single chokepoint. It loads the
  user's active `RoleAssignment`s in that exact `organizationId`, then checks whether any
  assigned `Role.permissionKeys` includes the requested permission. "Active" means
  `effectiveFrom <= now` and (`effectiveTo` is unset or `>= now`).
- `RoleAssignment.scope` is stored today as `{ type: "organization" }` — a discriminated shape,
  not a bare enum — specifically so a later phase can add `{ type: "project", projectId }` /
  `{ type: "organizationUnit", organizationUnitId }` variants without migrating existing
  documents or changing `authorize()`'s calling convention.
- `hasActiveRoleAssignment` answers a narrower question ("is this user a member of this
  organization at all") for `requireOrganizationAccess`, kept separate from permission-specific
  `authorize()` so organization-switching UI doesn't need to probe an arbitrary permission key.

- **Permission granularity** (added in Phase 2, before Workforce/Attendance/Leave/Payroll
  introduce many more permissions, so the convention is settled early rather than retrofitted):
  every permission key is `<resource>.<create|read|update>`, matching AGENTS.md §20's own example
  (`employees.read`, `employees.create`) rather than one coarse `<resource>.manage`. There is no
  `.delete` key anywhere, because nothing in this codebase hard-deletes (§53) — removal is always
  a `status` transition, covered by `.update`. `GET` routes now require `<resource>.read`
  explicitly rather than the weaker "any org member can read" default Phase 1 used — Server
  Component pages call the same `requirePermission` check the API routes do
  (`src/app/organization/_shared/has-permission.ts`), so a page can't accidentally show data an
  API route would have refused.
- `Permission` documents also carry `category` (grouping for a future permissions-management UI)
  and `isSystem` (reserved for a future custom/org-defined permission, not introduced yet).
  Neither field is read by `authorize()` — they're display metadata only.

## Consequences

- Phase 1 can only express organization-wide grants — there is no project yet to scope to, so
  §60's project-vs-project denial isn't fully exercisable until Phase 2/3 introduce `Project` and
  project-scoped assignments. The Phase-1-narrowed version of that test (see
  `tests/server/authorization/authorize.test.ts`) covers what does exist now: an org-scoped grant
  works within its organization and is denied in a different organization; expired,
  not-yet-effective, and permission-mismatched assignments are all denied.
- Extending `scope` to `project`/`organizationUnit` in a later phase requires only adding new
  discriminant branches to `authorize()`'s query and to this ADR — not a new authorization
  mechanism.
- `hasActiveRoleAssignment`/`requireOrganizationAccess` are no longer called by any route now that
  reads require an explicit `.read` permission — kept as a documented primitive (AGENTS.md §22
  names it explicitly) for a future case that only needs "is this user a member at all" (e.g. an
  organization switcher), not removed as dead code.
