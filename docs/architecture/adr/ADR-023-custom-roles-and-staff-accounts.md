# ADR-023: Custom roles and staff accounts, on top of the existing literal-permission RBAC

## Status

Accepted

## Context

The user wanted a real, employee-specific case handled: someone holding a particular Position
(e.g. Building Administrator) should be able to do full employee-record CRUD, and asked that this
be made "flexible... without hardcoding anything." That request sits close to a boundary this project already drew: an earlier request to make `Role` itself
catalog-driven, and a separate request for a fully dynamic/DB-driven permissions engine, were both
declined in favor of keeping every permission *check* as a literal string comparison in
`authorize()`.

Presented with the fork — (a) reuse the existing `Role`/`RoleAssignment`/`Permission` model with a
real management UI so HR can compose a role from existing permission keys and assign it to
anyone, vs. (b) make a Position itself imply permissions automatically, a new authorization input
this codebase's `Position` model explicitly disclaims ("never used for authorization... anywhere")
— the user chose (a).

Also surfaced along the way: giving a *self-service* employee account (one with `User.employeeId`
set) a permission-rich role wouldn't actually grant HR-shell access, because `(app)/layout.tsx`
redirects any such session straight to `/clock` before permissions are ever resolved. A person who
needs real HR-shell CRUD access — like a Building Administrator — needs a plain, non-self-service
login, the same kind the seeded HR Administrator account already is. There was previously no way
to create a *second* one of those through the UI; only `scripts/seed.ts`'s one-time bootstrap
could.

## Decision

- **`Role` gains a `status` field** (`"active" | "inactive"`), and `authorize()`'s granting query
  now requires it (`$or: [{status:"active"}, {status:{$exists:false}}]` — permissive for every
  role seeded before this field existed, so this ships without a required migration on the real
  cluster; `scripts/seed.ts` also backfills the field for cleanliness). Deactivating a role
  immediately stops it from granting anything to everyone holding it — a live "retire" switch,
  not a delete.
- **`RoleService`** (`src/domains/authorization/role-service.ts`): `create`/`update` validate
  every `permissionKey` against the real, seeded `Permission` catalog (rejects typos/unknown keys
  with a `BusinessRuleError`, never silently accepts a made-up string) — this is the "no
  hardcoding" half: which keys exist is still literal/seeded, but which *combination* a named role
  grants, and to whom, is fully HR-configurable data.
- **`RoleAssignmentService`**: `assign`/`revoke`/`listForOrganization`/`listOrganizationMembers`.
  Revoking sets `effectiveTo` (never deletes the row — full history stays queryable, same as every
  other effective-dated model here). `listOrganizationMembers()` is the pool the "assign a role"
  picker draws from: every distinct `User` who already has *some* RoleAssignment in the org.
- **`StaffAccountService`** (`src/domains/identity/staff-account-service.ts`): creates a plain
  login — `Person` + `User`, **no** `employeeId` — optionally assigning a role in the same call.
  Deliberately separate from `EmployeeAccountService` (self-service, always sets `employeeId`):
  the two account kinds route completely differently (`(app)/layout.tsx`'s `employeeId` check), so
  conflating them into one service with a flag would blur a distinction the redirect logic depends
  on. This is what actually makes "Building Administrator" reachable in practice, not just
  assignable on paper.
- **UI**: `/settings/access` — three sections (Roles, with a permission-checkbox editor grouped
  by category; Access, the current assignment list with revoke; Staff accounts, the creation
  dialog with an optional role picked at creation time). New permission keys:
  `roles.create/read/update/assign`, `staff-accounts.create`.

## Consequences

- A Building-Administrator-style account is still, architecturally, an HR-shell account — it sees
  the same sidebar shell as any other staff login, just scoped down by whichever permission keys
  its role carries. There's no partial/kiosk-style shell for "elevated employee but not full HR."
  If that's ever needed, it's a separate, later decision — not something this change forces.
- Nothing here changes how the *checks* themselves work: `authorize()` is still a literal
  permission-key lookup, and every route still calls `requirePermission("resource.action", ...)`
  with a hardcoded string. What changed is that the mapping from *account* → *permission keys* is
  now fully data-driven and HR-editable, instead of only being editable by re-running
  `scripts/seed.ts`.
