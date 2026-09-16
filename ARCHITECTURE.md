# Architecture

WorkforceHub HRIS is a configurable, multi-tenant-capable HRIS platform. The database describes
the business (organizations, people, roles, permissions); the application code provides reusable
capabilities on top of that data. See [AGENTS.md](./AGENTS.md) for the full engineering
instructions this repository is built against.

## Status

**Phase 1 — Foundation** (see AGENTS.md §57). Implemented: Organization, User, Person, Role,
Permission, RoleAssignment, AuditLog; server-side authorization; append-only audit logging;
Auth.js credentials login; a minimal dashboard.

Not yet implemented (later phases): OrganizationUnit, Position, Project/Location,
Employee/Employment/EmployeeAssignment, Organizational Chart, Attendance, Leave, Payroll,
Recruitment, Performance, Cases, Assets, Documents, Events.

## Architecture style

Domain-oriented modular monolith (ADR-001). No microservices, no message broker, no Redis —
none of those have a concrete requirement yet (AGENTS.md §45).

## Directory structure

```
src/
├── app/            Next.js App Router routes (pages + API route handlers)
├── domains/        Domain services — business logic, one folder per bounded domain
├── server/         Cross-cutting server infrastructure: db, auth, authorization, audit
└── shared/         Validation (Zod), error types, shared TS types
```

Route handlers orchestrate: Authenticate → Validate → Resolve Context → Authorize → Execute
(domain service) → Persist → Audit → Return. They do not contain business logic themselves
(AGENTS.md §37).

## Identity model (ADR-003)

`User` (login identity) → `Person` (human identity) are already separated, even though Phase 1
only has one HR user. `Employee` / `Employment` / `EmployeeAssignment` are introduced in Phase 3
once Workforce is built — a `Person` is not assumed to be an employee.

## Authorization (ADR-007)

Server-side only, resolved from data on every check — never cached role-name strings, never
`user.role === "..."`:

- `authorize({ userId, organizationId, permission })` — throws unless the user has an active
  (`effectiveFrom <= now <= effectiveTo|null`) `RoleAssignment` in that organization whose `Role`
  carries the permission key.
- `hasActiveRoleAssignment({ userId, organizationId })` — organization *membership* only, used by
  `requireOrganizationAccess`.
- `requireAuthenticatedUser()`, `requireOrganizationAccess(organizationId)`,
  `requirePermission(permission, organizationId)` — the primitives route handlers call.

`RoleAssignment.scope` is a discriminated `{ type: "organization" }` shape today so `project` /
`organizationUnit` scope types can be added in a later phase without a schema migration —
without building the full multi-scope policy-resolution hierarchy prematurely (AGENTS.md §21/§26).

## MongoDB modeling (ADR-002)

Phase 1 collections: `organizations`, `people`, `users`, `permissions`, `roles`,
`roleAssignments`, `auditLogs`.

- `Role.permissionKeys: string[]` is embedded rather than a `rolePermissions` join collection —
  a role's permission set is small, bounded, and always read together with the role.
- `RoleAssignment` references `User`, `Role`, `Organization` by id — assignments have an
  independent lifecycle (effective-dated, revocable) from all three.
- `AuditLog` is append-only: no update/delete API is exposed over it anywhere in the codebase.

Indexes (all justified by an actual query above): `organizations.slug` (unique),
`users.username` (unique, sparse), `users.email` (unique, sparse), `roles.organizationId+name`
(unique), `people.organizationId`,
`roleAssignments.userId+organizationId`, `roleAssignments.roleId`,
`auditLogs.organizationId+timestamp`, `auditLogs.organizationId+resourceType+resourceId`.

## Audit (part of ADR-007's server-side trust boundary)

`AuditService.record(...)` is the only write path onto `AuditLog`. Wired into organization
creation today; every future mutation in Phase 2+ (assignment changes, role changes, payroll
finalization, ...) must call it too, per AGENTS.md §35.

## Auth.js session strategy (ADR-010)

JWT session strategy. The token carries only `userId` — no role or permission is cached in the
token, so authorization is always re-resolved from `RoleAssignment`/`Role` at request time and a
revoked assignment takes effect immediately rather than waiting for the token to expire.

## Known gaps (tracked, not silently ignored)

- **Rate limiting** (`src/server/auth/rate-limit.ts`) is an in-memory, single-process limiter.
  On a multi-instance/serverless deployment each instance tracks separately, so it is a
  best-effort mitigation, not complete brute-force protection. Revisit with Upstash/Redis only
  when there's a concrete incident or requirement (AGENTS.md §45) — not preemptively.
- No `SessionProvider` / client-side `useSession()` wiring yet — the dashboard reads the session
  server-side. Add it if a future page needs client-side session state.
