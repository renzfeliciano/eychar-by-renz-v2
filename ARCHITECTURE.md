# Architecture

WorkforceHub HRIS is a configurable, multi-tenant-capable HRIS platform. The database describes
the business (organizations, people, roles, permissions); the application code provides reusable
capabilities on top of that data. See [AGENTS.md](./AGENTS.md) for the full engineering
instructions this repository is built against.

## Status

**Phase 8a — Catalogs + Recruitment** (see AGENTS.md §57) on top of Phases 1–7. Implemented:
Organization, User, Person, Role, Permission, RoleAssignment, AuditLog, OrganizationUnit,
Position, Location, Project, Employee, Employment, EmployeeAssignment, AttendancePolicy,
AttendanceRecord, LeaveType, LeavePolicy, LeaveBalance, LeaveRequest, PayrollPolicy,
PayrollRuleVersion, Compensation, PayrollRun, PayrollRecord, PayrollAdjustment,
EmploymentType, EmploymentStatus, AttendanceStatus, RecruitmentStage, EventCategory,
CaseClassification, CaseStatus (org-managed catalogs, ADR-016), JobOpening, Applicant
(Recruitment, ADR-015); server-side authorization with a granular per-resource permission
catalog; append-only audit logging; Auth.js credentials (username-or-email) login with
single-active-session + idle-timeout enforcement; a shadcn/ui dashboard,
`/organization/{units,positions,locations,projects,chart}`, `/people`, `/attendance{,/policies}`,
`/leave{,/types,/policies,/balances}`, `/payroll{,/policies,/rule-versions,/compensation}`,
`/recruitment{,/tracking}`, and `/settings/catalogs` UI.

Not yet implemented (later Phase 8 sub-phases): Performance, Cases, Assets, Documents, Events —
though their org-managed lookup lists (EventCategory, CaseClassification, CaseStatus) are already
seeded and manageable under Settings > Catalogs, ahead of the domains that will consume them.

## Architecture style

Domain-oriented modular monolith (ADR-001). No microservices, no message broker, no Redis —
none of those have a concrete requirement yet (AGENTS.md §45).

## Directory structure

```
src/
├── app/
│   ├── (auth)/login/     Unauthenticated, outside the app shell
│   ├── (app)/            dashboard, organization/*, people/*, attendance/*, leave/* — shared sidebar+topbar layout
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

## Attendance (Phase 5, ADR-011)

**HR-recorded**, not employee self-check-in — no employee created via `HireService.hire()` gets
a login, only Phase 1's HR admin does, so there's no self-service session to check in from.
`AttendanceService.record()` (`src/domains/attendance/attendance-service.ts`) resolves the
employee's project as of the record's date (`EmployeeAssignmentService.getAsOf`), resolves the
applicable `AttendancePolicy` for that project+date
(`AttendancePolicyService.resolve`, ADR-011), and computes `present`/`late` from the check-in
time unless an explicit status is given — computed and stored once, never recomputed later.
`adjust()` is gated by `attendance.update` and writes a full before/after audit entry, which is
this phase's approval record rather than a separate request/approve workflow (that's Phase 6's
pattern).

## Leave (Phase 6, ADR-012)

Same HR-recorded scoping as Attendance — leave is requested on an employee's behalf, not
self-service. `LeaveType` is a seeded catalog (`requiresApproval` per type); `LeavePolicy`
resolves Organization→Project override the same way `AttendancePolicy` does, via the shared
`resolveOrgProjectPolicy()` extracted in ADR-011 once Leave needed the identical shape.
`LeaveBalance` stores only `entitledDays`/`adjustmentDays` — "used" days are derived at read
time (`LeaveBalanceService.getAvailable`) from the sum of `approved` `LeaveRequest.totalDays`,
never a stored counter that could drift. `LeaveRequestService.create()` rejects a request that
exceeds the available balance or overlaps an existing pending/approved request for the same
employee; `decide()` (gated by `leave.approve`, distinct from `leave.update`) is the real
request/approve state machine Phase 5 deferred — see ADR-012 for why `leave.approve` is its own
permission and why balance consumption is derived rather than stored.

## Payroll (Phase 7, ADR-014)

Same HR-recorded scoping as Attendance/Leave. `PayrollPolicy` (pay frequency, standard work
days/period) and `PayrollRuleVersion` (tax brackets, statutory contributions) both resolve
Organization→Project override independently via `resolveOrgProjectPolicy()` — the shared
resolver's third caller, after Attendance and Leave. `PayrollRuleVersion` is never edited in
place: a correction creates a new, auto-numbered version, so a `PayrollRun`'s snapshotted
`policyId`/`ruleVersionId` always identify exactly what was used, satisfying AGENTS.md §28's
reproducibility requirement directly. `Compensation` (base salary + allowance per pay period) is
its own effective-dated model, deliberately separate from `Employment` (see that model's own
comment) and revised via the same transfer mechanic as `EmployeeAssignment`.

`PayrollService.generateRun()` computes Basic Salary (prorated against `AttendanceRecord`
absences — `"on_leave"` rows don't count, no Attendance/Leave model changes needed) and
Tax/Statutory Contributions (via a generic progressive-bracket formula applied to seeded rule
data — never a hardcoded formula) automatically; Overtime, Holiday Pay, Night Differential,
Bonuses, 13th Month, Loans, and Other Deductions are HR-supplied `PayrollAdjustment` line items
at generation time rather than derived from attendance clock-in/out (no `HolidayCalendar` model
exists yet). Every employee's record is computed fully in memory before any write — see ADR-014
for why this replaces a Mongo transaction for run atomicity. `approve()` is gated by
`payroll.approve`, its own permission (same precedent as `leave.approve`).

## Catalogs (Phase 8 foundation, ADR-016)

Employment statuses, employment types, attendance statuses, recruitment stages, event
categories, case classifications, and case statuses are org-managed lookup lists, not hardcoded
option arrays — matching the existing `LeaveType`/`Position`/`Project` precedent. Each is its own
Mongoose model/collection built from a shared `buildSimpleCatalogSchema()` factory, and each has
its own bound service built from a shared `createSimpleCatalogService()` factory — one schema
shape and one CRUD+audit implementation, reused seven times, without merging the seven entities
into one table. A `CATALOG_REGISTRY` maps seven URL-safe slugs to `{service, permissionPrefix}`
so `/api/catalogs/[type]` stays two route files instead of fourteen.

`assertValidCode(organizationId, code)` is permissive when an organization hasn't configured any
items for that type (any code is accepted) and strict once at least one item exists (the code
must match an active one) — this is what let `Employment.status`/`employmentType` and
`AttendanceRecord.status` drop their hardcoded `enum` arrays in favor of catalog validation with
zero changes to either domain's pre-existing tests. `metadata` (Mixed, default `{}`) is the
extension point for business-rule hooks — e.g. `EmploymentStatus.metadata.isActiveHeadcount`
drives whether the Terminate button shows on `/people/[id]`, and
`RecruitmentStage.metadata.{sortOrder,isTerminal}` drive the Application-tracking Kanban's
column order and terminal-stage detection — without a business-rules engine existing yet.

`scripts/seed.ts` seeds a starter set of values for all seven types (sourced from the legacy
v1 app's real "Workspace administration" lists) plus real `Position`/`Project` data, each
upserted idempotently by `{organizationId, code}` so re-running `db:seed` never duplicates rows.

## Recruitment (Phase 8a, ADR-015)

`JobOpening` references `Position` (never duplicates its title) and tracks `headcount`/`status`.
`Applicant.stage` is a catalog code (`RecruitmentStage`), not a hardcoded enum — `advanceStage()`
only allows moving to a non-terminal stage with a higher `sortOrder` than the current one,
`reject()` only fires from a non-terminal stage, and `hire()` only fires from the org's
configured final non-terminal stage, all read from the catalog at call time. `hire()` delegates
to the existing `HireService.hire()` (ADR-015) rather than duplicating employee creation, then
sets the applicant to the terminal "hired" code and links `hiredEmployeeId`.

`/recruitment/tracking` is a Kanban-style board: columns are `RecruitmentStage` items ordered by
`sortOrder`, cards are applicants, and each card's available actions (Move/Reject/Hire) are
computed client-side from the full stage list — no drag-and-drop library, click-based actions
only, since nothing in this phase needs free-form reordering.

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
across `/organization`, `/people`, and `/attendance`) so a page can never show data an API route
would refuse.
`Permission` documents also carry
`category` (grouping, for a future permissions UI) and `isSystem` (reserved) — display metadata
only, never read by `authorize()`.

`RoleAssignment.scope` is a discriminated `{ type: "organization" }` shape today so `project` /
`organizationUnit` scope types can be added in a later phase without a schema migration —
without building the full multi-scope policy-resolution hierarchy prematurely (AGENTS.md §21/§26).

## MongoDB modeling (ADR-002)

Collections: `organizations`, `people`, `users`, `permissions`, `roles`, `roleAssignments`,
`auditLogs`, `organizationUnits`, `positions`, `locations`, `projects`, `employees`,
`employments`, `employeeAssignments`, `attendancePolicies`, `attendanceRecords`.

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
`employeeAssignments.reportsToEmployeeId`, `attendancePolicies.organizationId+projectId`,
`attendanceRecords.organizationId+employeeId+date` (unique),
`attendanceRecords.organizationId+date`.

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
