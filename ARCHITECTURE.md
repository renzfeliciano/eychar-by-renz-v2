# Architecture

WorkforceHub HRIS is a configurable, multi-tenant-capable HRIS platform. The database describes
the business (organizations, people, roles, permissions); the application code provides reusable
capabilities on top of that data. See [AGENTS.md](./AGENTS.md) for the full engineering
instructions this repository is built against.

## Status

**Phase 4 — Organizational Chart** (see AGENTS.md §57) on top of Phases 1–3. Implemented:
Organization, User, Person, Role, Permission, RoleAssignment, AuditLog, OrganizationUnit,
Position, Location, Project, Employee, Employment, EmployeeAssignment; server-side authorization
with a granular per-resource permission catalog; append-only audit logging; Auth.js credentials
(username-or-email) login with single-active-session + idle-timeout enforcement; a shadcn/ui
dashboard, `/organization/{units,positions,locations,projects,chart}`, and `/people` UI.

Not yet implemented (later phases): Attendance, Leave, Payroll, Recruitment, Performance, Cases,
Assets, Documents, Events.

## Architecture style

Domain-oriented modular monolith (ADR-001). No microservices, no message broker, no Redis —
none of those have a concrete requirement yet (AGENTS.md §45).

## Directory structure

```
src/
├── app/
│   ├── (auth)/login/     Unauthenticated, outside the app shell
│   ├── (app)/            dashboard, organization/*, people/* — shared sidebar+topbar layout
│   ├── _shared/          getCurrentOrganization/hasPermission — used by every (app) page
│   └── api/               Route handlers
├── components/
│   ├── ui/                shadcn/ui primitives (copied in, not an opaque dependency)
│   └── shared/            PageHeader, DataTable, StatusBadge, FormField, OptionSelect, AppShell
├── domains/        Domain services — business logic, one folder per bounded domain
├── server/         Cross-cutting server infrastructure: db, auth, authorization, audit
└── shared/         Validation (Zod), error types, shared TS types
```

Route handlers orchestrate: Authenticate → Validate → Resolve Context → Authorize → Execute
(domain service) → Persist → Audit → Return. They do not contain business logic themselves
(AGENTS.md §37). See ADR-013 for the UI/design-system layer.

## Identity model (ADR-003)

`User` (login identity) → `Person` (human identity) → `Employee` (workforce identity) →
`Employment` (lifecycle) → `EmployeeAssignment` (where/what/who) — five distinct models, per
AGENTS.md §13. A `Person` is not assumed to be an `Employee` (Phase 1's HR user has no `Employee`
record at all); an `Employee` has no status field of its own — see "Workforce (Phase 3)" below.

## Organization structure (Phase 2)

`OrganizationUnit` (self-referencing `parentUnitId`, free-form `type`), `Position`
(`organizationUnitId?`), `Location`, `Project` (`locationId?`) — see ADR-004 (Position vs Role)
and ADR-006 (Effective Dating) for the two decisions specific to this phase. No hard delete
anywhere (AGENTS.md §53); every domain service exposes `create()` and `updateStatus()`
(active/inactive, plus `effectiveTo` for the two effective-dated models) but never a delete.

## Workforce (Phase 3)

`Employee` is pure identity (`personId`, `employeeNumber`) — no status field, since "is this
employee active" is answered by their latest `Employment`, not a second flag that could drift out
of sync. `Employment` is the effective-dated lifecycle (`employmentType` free-form,
`status: active|on_leave|terminated`); a rehire is just a new row, not a special case.
`EmployeeAssignment` is where/what/who (`positionId?`/`organizationUnitId?`/`projectId?`/
`locationId?`/`reportsToEmployeeId?`), effective-dated. See ADR-005 for the transfer mechanic —
moving an employee closes the current assignment and creates a new one, never an in-place edit,
which is what makes historical reconstruction (`getAsOf(employeeId, date)`) possible.
`HireService.hire(...)` orchestrates Person → Employee → Employment → EmployeeAssignment as three
separately audited writes for a new hire, not one Mongo transaction (see ADR-005's consequences).

## Organizational chart (Phase 4, ADR-009)

A projection, not a source of truth (AGENTS.md §18) — `OrgChartService.getSnapshot(organizationId,
filters)` (`src/domains/workforce/org-chart-service.ts`) builds a reporting-relationship tree
(via `EmployeeAssignment.reportsToEmployeeId`) from a single bulk as-of-date query, the same
effective-dating filter `EmployeeAssignmentService.getAsOf` uses per-employee, generalized to the
whole organization. Vacant positions (active `Position`s with no current assignment) are a
separate list, not slotted into the tree. No new collection, no new permission key — `GET
/api/organization-chart` requires the existing `employees.read`.

## Authorization (ADR-007)

Server-side only, resolved from data on every check — never cached role-name strings, never
`user.role === "..."`:

- `authorize({ userId, organizationId, permission })` — throws unless the user has an active
  (`effectiveFrom <= now <= effectiveTo|null`) `RoleAssignment` in that organization whose `Role`
  carries the permission key.
- `hasActiveRoleAssignment({ userId, organizationId })` — organization *membership* only; kept as
  a documented primitive (AGENTS.md §22) though no route currently calls it (see ADR-007).
- `requireAuthenticatedUser()`, `requireOrganizationAccess(organizationId)`,
  `requirePermission(permission, organizationId)` — the primitives route handlers call.

Permission keys are granular per resource — `<resource>.create` / `<resource>.read` /
`<resource>.update` (e.g. `positions.read`), matching AGENTS.md §20's own example, not one coarse
`<resource>.manage`. `GET` routes require `<resource>.read` explicitly; Server Component pages
call the identical `requirePermission` check via `src/app/_shared/has-permission.ts` (shared
across `/organization` and `/people`) so a page can never show data an API route would refuse.
`Permission` documents also carry
`category` (grouping, for a future permissions UI) and `isSystem` (reserved) — display metadata
only, never read by `authorize()`.

`RoleAssignment.scope` is a discriminated `{ type: "organization" }` shape today so `project` /
`organizationUnit` scope types can be added in a later phase without a schema migration —
without building the full multi-scope policy-resolution hierarchy prematurely (AGENTS.md §21/§26).

## MongoDB modeling (ADR-002)

Collections: `organizations`, `people`, `users`, `permissions`, `roles`, `roleAssignments`,
`auditLogs`, `organizationUnits`, `positions`, `locations`, `projects`, `employees`,
`employments`, `employeeAssignments`.

- `Role.permissionKeys: string[]` is embedded rather than a `rolePermissions` join collection —
  a role's permission set is small, bounded, and always read together with the role.
- `RoleAssignment` references `User`, `Role`, `Organization` by id — assignments have an
  independent lifecycle (effective-dated, revocable) from all three.
- `AuditLog` is append-only: no update/delete API is exposed over it anywhere in the codebase.
- `OrganizationUnit.parentUnitId` references itself (unbounded hierarchy depth, independent
  lifecycle per node) rather than embedding children — a unit's descendants are queried
  independently of the unit itself, and cardinality is unbounded.
- `Employment` and `EmployeeAssignment` both reference `Employee` by id rather than embedding —
  both are unbounded, independently-queried histories (see ADR-005/ADR-006), not data owned
  exclusively by one `Employee` document.

Indexes (all justified by an actual query above): `organizations.slug` (unique),
`users.username` (unique, sparse), `users.email` (unique, sparse), `roles.organizationId+name`
(unique), `people.organizationId`, `roleAssignments.userId+organizationId`,
`roleAssignments.roleId`, `auditLogs.organizationId+timestamp`,
`auditLogs.organizationId+resourceType+resourceId`,
`organizationUnits.organizationId+code` (unique), `organizationUnits.parentUnitId`,
`positions.organizationId+code` (unique), `positions.organizationUnitId`,
`locations.organizationId+code` (unique), `projects.organizationId+code` (unique),
`projects.locationId`, `employees.organizationId+employeeNumber` (unique),
`employments.employeeId+effectiveFrom`, `employeeAssignments.employeeId+effectiveFrom`,
`employeeAssignments.reportsToEmployeeId`.

## Audit (part of ADR-007's server-side trust boundary)

`AuditService.record(...)` is the only write path onto `AuditLog`. Wired into organization
creation today; every future mutation in Phase 2+ (assignment changes, role changes, payroll
finalization, ...) must call it too, per AGENTS.md §35.

## Auth.js session strategy (ADR-010)

JWT session strategy. The token carries only `userId` — no role or permission is cached in the
token, so authorization is always re-resolved from `RoleAssignment`/`Role` at request time and a
revoked assignment takes effect immediately rather than waiting for the token to expire.
Single-active-session and idle-timeout enforcement (`src/server/auth/session-policy.ts`,
`ConcurrentSessionGuard`) are layered on top — see ADR-010's later section for the mechanism.

## Known gaps (tracked, not silently ignored)

- **Rate limiting** (`src/server/auth/rate-limit.ts`) is an in-memory, single-process limiter.
  On a multi-instance/serverless deployment each instance tracks separately, so it is a
  best-effort mitigation, not complete brute-force protection. Revisit with Upstash/Redis only
  when there's a concrete incident or requirement (AGENTS.md §45) — not preemptively.
- `lastActivityAt` idle tracking lives in the JWT, not rewritten to the database on every
  request — avoids write-amplification, at the cost of trusting the (signed, tamper-proof)
  token's own timestamp rather than a server-side clock.
