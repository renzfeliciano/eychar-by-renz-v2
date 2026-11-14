# Authentication and authorization

**Purpose:** who a signed-in person is, what they may do in an organization, and where each rule is enforced.
**Governing docs:** ARCHITECTURE.md "Authorization (ADR-007)", "Custom roles & staff accounts (ADR-023)", "Sign-in security (ADR-030)", "Auth.js session strategy (ADR-010)"; docs/ENGINEERING.md §19 (identity), §20 (RBAC), §21 (role assignment), §22 (scoped authorization), §23 (UI authorization), §24 (project switching), §40 (middleware), §42 (security); ADR-003, ADR-007, ADR-010, ADR-023, ADR-030, ADR-033, ADR-034 (cited, file missing), ADR-039, ADR-043, ADR-045.
**Last verified:** 6587050.

Code wins over docs. Where docs and code disagree, the code is listed under "Known gaps / mismatches".

---

## 1. Authentication

### 1.1 Auth.js configuration

- `src/server/auth/options.ts`: `authOptions`. JWT session strategy (`session.strategy: "jwt"`), cookie `maxAge` 30 days. Real session end is decided in the `jwt` callback (idle, absolute lifetime, concurrent session, sign-out, password change).
- Single provider: `CredentialsProvider` with fields `login`, `password`, `otp`. Its `authorize` only calls `signInWithPassword` (`src/domains/identity/sign-in.ts`) and maps the result. A wrong password or unknown account returns `null`; other outcomes (`locked`, `rate_limited`, `mfa_required`, `invalid_otp`) are thrown so the login page can show a message (`src/app/(auth)/login/sign-in-messages.ts`).
- Login page: `src/app/(auth)/login/page.tsx`. Other auth-group pages: `src/app/(auth)/change-password/`, `src/app/(auth)/set-up-two-step/`.
- Session access: `src/server/auth/session.ts` exports `getSession` (React `cache` around `getServerSession(authOptions)`). Its own comment says always use it, never `getServerSession` directly.
- Route: `src/app/api/auth/[...nextauth]/route.ts`.
- `NEXTAUTH_SECRET` signs the token. Env names are in `.env.local.example` (values are never recorded here).

### 1.2 Sign-in decision (`signInWithPassword`, `src/domains/identity/sign-in.ts`)

In order:
1. Per-network attempt limit, `LoginGuard.allowAttempt("ip:<ip>")` (`src/domains/identity/login-guard.ts`). 30 attempts per 15 minutes, counted in the `LoginThrottle` collection.
2. Parse with `loginSchema` (`src/shared/validation/auth.ts`).
3. Account attempt reserved atomically before the argon2 check (`LoginGuard.reserveAttempt`). Locked accounts get no attempt.
4. Password via argon2. Unknown logins run a dummy hash so timing does not reveal which usernames exist. Unknown logins are throttled by normalized login string (`recordUnknownLoginFailure`).
5. Lock: 5 consecutive failures lock the account for 15 minutes (`MAX_FAILED_SIGN_INS`, `LOCK_MINUTES`, `src/domains/identity/login-guard.ts`).
6. Two-step, if `user.mfa.enabled`: no code yet returns `mfa_required` and releases the reserved attempt. A wrong code counts as a failure (`MfaService.verifySignIn`, `src/domains/identity/mfa-service.ts`).
7. Success clears the failure count and audits `auth.signed-in`.

Every outcome is audited through `src/domains/identity/user-audit.ts`.

### 1.3 Two-step verification

- TOTP: `src/server/auth/totp.ts`. Secrets are AES-256-GCM encrypted (`src/server/auth/secret-box.ts`). Recovery codes: `src/server/auth/recovery-codes.ts`.
- Management service: `src/domains/identity/mfa-service.ts` (`startEnrollment`, `confirmEnrollment`, `regenerateRecoveryCodes`, `disable`, `adminReset`). Each sensitive step re-checks the password (`src/domains/identity/confirm-password.ts`).
- Organization-wide requirement for staff: `src/domains/identity/security-settings-service.ts` (`requireTwoStepForStaff`). Enforced in the jwt callback: `mustSetUpTwoStep` is set for an account with no `employeeId`, no `mfa.enabled`, in an organization that requires it (`needsTwoStepSetup` in `options.ts`). The app layout redirects to `/set-up-two-step` (`src/app/(app)/layout.tsx`). `requireAuthenticatedUser` refuses other routes until set up (`src/server/authorization/require.ts`).
- Turning on the requirement needs the Super Administrator to have two-step on first (`security-settings-service.ts`).
- Self-service employee accounts (with `employeeId`) are exempt (ADR-039).

### 1.4 WebAuthn (passkeys)

- Not a sign-in factor. `src/server/auth/options.ts` has no WebAuthn step.
- Used only for self-service clock-in/out: `src/domains/identity/webauthn-service.ts`, called from `src/domains/attendance/self-service-attendance-service.ts` (`verifyAuthentication`). Routes under `src/app/api/self-service/webauthn/*` and `src/app/api/employee-accounts/[id]/webauthn/route.ts`.
- Challenges are stored and consumed once (`storeChallenge` / `consumeChallenge`, 2-minute TTL).

### 1.5 Session policy: idle timeout, single session, lifetime

- Pure decision function: `resolveSessionState` in `src/server/auth/session-policy.ts`. Checks in order: idle timeout, absolute lifetime, account missing or disabled, no active session (`session_ended`), different active session (`concurrent_session`).
- Single active session: `User.activeSessionId`. `authorize` sets a new UUID per sign-in, superseding any other (`options.ts`). `replacedSessionActivity` tells the new session when the old one was live.
- Idle limit: per organization, `SecuritySettingsService.forUser(userId)` (`security-settings-service.ts`), cached in the token as `idleMs` and refreshed only on real activity (`trigger === "update"`). Server adds `SERVER_IDLE_GRACE_MS` (30 s) (`src/lib/session-idle.ts`).
- Absolute lifetime: `SESSION_MAX_HOURS` (default 12) in `src/server/auth/inactivity.ts`, checked against `token.signedInAt`.
- Activity: the browser `IdleSessionGuard` (`src/components/shared/idle-session-guard.tsx`) pings every `ACTIVITY_PING_MS` (15 s) and shows a warning. Other tabs are told via local storage. `ConcurrentSessionGuard` (`src/components/shared/concurrent-session-guard.tsx`) shows the replaced-session notice.
- Sign-out ends the session server-side (`events.signOut` in `options.ts`, `endActiveSession`).
- Password change, reset, disable: `session_ended` / re-check on the next request.
- Expired sessions set `session.error` (`SessionExpired`, `SessionEnded`, `ConcurrentSessionError`) (`options.ts`, `src/shared/types/next-auth.d.ts`).
- `mustChangePassword` and `mustSetUpTwoStep` are re-read from the database on every request, so they take effect at once.

### 1.6 What the JWT carries

From `options.ts` and `src/shared/types/next-auth.d.ts`: `userId`, `sessionId`, `lastActivityAt`, `signedInAt`, `idleMs`, `twoStepRequired`, `mustChangePassword`, `mustSetUpTwoStep`, `seesHidden`, `expired` / `expiredReason`, `replacedSessionAt`, `replacedBy`.

**No roles or permission keys are in the token.** Authorization is re-resolved on each check (see §2.3).

### 1.7 Other request guards

- CSRF / origin check on `/api/*` for data-changing methods: `src/proxy.ts` calls `checkRequestOrigin` in `src/server/security/csrf.ts`. Exempt: `/api/auth/` and `/api/cron/`.
- CSP nonce for pages (production only): `src/server/security/csp.ts`, `src/proxy.ts`.
- Cron: `src/server/security/cron-auth.ts` (`CRON_SECRET`, constant time), used by `src/app/api/cron/*`.
- Per-user rate limits for exports, payroll, bulk changes, password re-checks, uploads: `src/server/security/rate-limit.ts` (`RATE_LIMITS`). Also backed by `LoginThrottle`.
- Password policy (NIST 800-63B style): `src/shared/validation/password-policy.ts`.
- Client IP for throttling and audit: `clientIp` in `src/domains/identity/login-guard.ts`.

---

## 2. Permission model

### 2.1 The permission catalog

- **Defined in:** `scripts/seed.ts`, the `BASELINE_PERMISSIONS` array (roughly lines 51–260). Each entry is `{ key, description, category }`. It is seeded data, not app logic (comment in the same file).
- **Stored in:** `Permission` collection, model `src/server/db/models/permission.ts` (`key` unique; `category` for display; `isSystem` is unused by `authorize`).
- **Seeded by:** `upsertPermissionCatalog()` in `scripts/seed.ts` (`$setOnInsert`, so descriptions are not updated on re-seed). Run through `npm run db:seed` (idempotent). `retireSupersededPermissions()` removes the `RETIRED_PERMISSION_KEYS` list.
- **Naming:** `<resource>.create|read|update`, plus a few action keys (`clearance.sign-off`, `clearance.waive`, `final-settlements.approve`, etc.). Delete keys end in `.delete`. The only one seeded is `leave-types.delete`.
- **Catalog editor source:** `RoleService.listAvailablePermissions()` (`src/domains/authorization/role-service.ts`) lists all keys except `*.delete`.

### 2.2 Roles and assignments

- **Role:** `src/server/db/models/role.ts`. Fields: `organizationId`, `name` (unique per org), `permissionKeys: string[]` (embedded), `status: active|inactive` (missing is treated as active), `system: "super_admin"` (optional).
- **RoleAssignment:** `src/server/db/models/role-assignment.ts`. Fields include `userId`, `roleId`, `organizationId`, `effectiveFrom`, `effectiveTo`, `scope`. Revoking sets `effectiveTo`; it never deletes (ARCHITECTURE, ADR-023).
- **Scope** (ADR-043): `{ type: "organization" }` or `{ type: "project", projectIds }`. A missing scope counts as organization-wide. An unknown type grants nothing (`scopeOf` in `src/server/authorization/authorize.ts`).
- **Managing roles:** `src/domains/authorization/role-service.ts` (create, update, list, get). `src/domains/authorization/role-assignment-service.ts` (assign, revoke). UI: `src/app/(app)/settings/access/` (`page.tsx`, `role-form-dialog.tsx`). API: `src/app/api/roles/`, `src/app/api/role-assignments/`.
- **Anti-escalation rules** (role-service.ts, role-assignment-service.ts, super-admin-service.ts):
  - A person may add only permissions they hold themselves (`assertCanAddPermissions`).
  - Delete keys cannot be put on any ordinary role (`assertNoDeletePermissions`, `isDeletePermission`).
  - Admin-power keys (`ADMIN_PERMISSION_KEYS`: `roles.create`, `roles.update`, `roles.assign`, `users.create`, `users.update`) can be handled only by the Super Administrator (`assertCanManageAdminRole`).
  - The reserved name "Super Administrator" cannot be used (`isReservedRoleName`).
  - The Super Administrator role cannot be edited, assigned or revoked from the app.
- **Seeded roles** (`scripts/seed.ts`): `HR Administrator` gets every non-delete key from the catalog via `$addToSet` on each seed run (so re-seeding brings it up to date). It is assigned to the HR seed account. The `Super Administrator` role is created separately (below).

### 2.3 Authorization resolution

`src/server/authorization/authorize.ts`:
- `authorize({ userId, organizationId, permission, projectId? })` is the single chokepoint. It throws `AuthorizationError` unless the user has an active assignment in that exact organization whose role carries the key, at organization scope, or at project scope when `projectId` matches.
- `activeGrants` (wrapped in React `cache`, so one render reads roles once; API calls always read fresh) loads assignments effective now, then the roles that are active. It returns `HeldGrants = { superAdmin, keys, projectKeys }`.
- `accessibleProjectIds` returns `"all"` or the caller's project ids, for list endpoints to filter.
- `hasActiveRoleAssignment` is organization membership only. `heldPermissions` and `keysInAnyScope` are for missing-grant checks and navigation hints. `keysInAnyScope` is documented as "never for a security decision".

### 2.4 Super Administrator

- **Role:** a `Role` with `system: "super_admin"` in each organization. Created only by `SuperAdminService.ensure()` (`src/domains/authorization/super-admin-service.ts`), which is called from `scripts/seed.ts`. Its `permissionKeys` is set to every catalog key at seed time. Only one holder is allowed; another holder throws `BusinessRuleError`.
- **Special case in code:** `activeGrants` sets `superAdmin = true` only when the super_admin role is held at organization scope. `authorize` and `accessibleProjectIds` return immediately for it (so new keys pass too). `missingGrants` returns nothing missing for it.
- **Seed:** `SEED_SUPER_ADMIN_*` creates a separate account (`readSuperAdminSeed`, `ensureSeedAccount`, `assertSuperAdminRoleFree` in `scripts/seed.ts`). If unset, the HR account gets the role. The seed never moves the role from an existing holder.
- **Service-level checks** (not route permission keys): delete, restore, purge (`src/domains/deletion/deletion-service.ts`, ADR-033); security settings (`security-settings-service.ts`); hide/unhide records (`src/domains/visibility/visibility-service.ts`); admin-role management (`super-admin-service.ts`); `SuperAdminService.isSuperAdminAnywhere` is used for `seesHidden` in the token.
- **UI:** `src/app/_shared/is-super-admin.ts`; nav items with `superAdminOnly` in `src/components/shared/nav-links.tsx`; layout passes `isSuperAdmin` and `heldPermissions: undefined` (no filtering) (`src/app/(app)/layout.tsx`).
- **Commit 78b5311** ("Seed a separate Super Administrator account") matches this code: the seed path above is present.

### 2.5 Hidden test data (visibility, ADR-034)

- `src/server/db/hidden-plugin.ts`: Mongoose plugin adds `hiddenFromOthers` and filters reads (`find`, `findOne`, `countDocuments`, `distinct`, updates, `aggregate`) unless `viewerSeesHidden()` is true or the query passes `includeHidden`.
- `src/server/db/visibility-context.ts`: `viewerSeesHidden()` decodes the session cookie with `next-auth/jwt` and reads `tokenSeesHidden` (`src/server/auth/token-visibility.ts`). No database call per query.
- Who sees hidden records: the Super Administrator, and self-service employees (`viewerMaySeeHidden` in `options.ts`).
- Hideable types: `HIDEABLE` map in `src/domains/visibility/visibility-service.ts`. Set by `POST /api/visibility` (`src/app/api/visibility/route.ts`).
- Plugin applied per model (examples: `src/server/db/models/applicant.ts`, `case.ts`).

---

## 3. Enforcement points

### 3.1 Helpers used by route handlers and pages

| Helper | File | Use |
|---|---|---|
| `requireAuthenticatedUser({ allowPendingTwoStepSetup?, allowPendingPasswordChange? })` | `src/server/authorization/require.ts` | Session present; refuses `mustChangePassword` and `mustSetUpTwoStep` unless an option lets it through. |
| `requirePermission(key, organizationId)` | same | Authenticated + org-wide or any-scope check via `authorize`. Used by about 90 route files. |
| `requireProjectAccess(key, organizationId, projectId)` | same | One project; also checks the project belongs to the org. |
| `requireAccessibleProjects(key, organizationId)` | same | List endpoints; returns `{ projects }` for filtering. |
| `requireOrganizationAccess(organizationId)` | same | Membership only. No route calls it. |
| `requireSelfServiceEmployee()` | same | Self-service routes: `employeeId` from the user record, never from the client. |
| `authorize`, `accessibleProjectIds`, `heldPermissions` | `src/server/authorization/authorize.ts` | Lower level; used by services. |
| `hasPermission(key, organizationId)` | `src/app/_shared/has-permission.ts` | Boolean wrapper for Server Components. |
| `accessibleProjects(key, organizationId)` | `src/app/_shared/accessible-projects.ts` | Pages over project data. Returns `null` for NoAccessState. |
| `getCurrentOrganization()` | `src/app/_shared/get-current-organization.ts` | First accessible organization (`OrganizationService.listAccessibleTo`). |
| `getSelfServiceSession` | `src/app/_shared/get-self-service-session.ts` | Self-service pages. |
| `isSuperAdmin(organizationId)` | `src/app/_shared/is-super-admin.ts` | Pages/UI. |

Also: `src/server/authorization/index.ts` re-exports `authorize.ts` and `require.ts`. `src/shared/errors/app-error.ts` defines `AuthorizationError`. `src/shared/errors/to-response.ts` maps errors to HTTP responses.

### 3.2 Worked trace: `GET /api/employees`

File: `src/app/api/employees/route.ts`.

1. `organizationIdParamSchema.parse` reads `organizationId` from the query string (`src/shared/validation/organization.ts`). The client value is not trusted until checked below.
2. `requirePermission("employees.read", organizationId)` (`src/server/authorization/require.ts`):
   a. `requireAuthenticatedUser()`: `getSession()` (`src/server/auth/session.ts`) runs `authOptions.callbacks.jwt` (`src/server/auth/options.ts`): idle check, absolute lifetime, single-session check, `UserModel` status lookup, and writes `mustChangePassword` / `mustSetUpTwoStep`.
   b. `authorize({ userId, organizationId, permission })` (`src/server/authorization/authorize.ts`): `activeGrants` loads `RoleAssignmentModel` (effective now, this org) and `RoleModel` (status active or missing). Returns if `superAdmin` or `keys.has("employees.read")`. Otherwise throws `AuthorizationError`.
3. `EmployeeService.listWithCurrentStatus(organizationId)` (`src/domains/workforce/employee-service.ts`). Reads go through Mongoose, so `hiddenPlugin` (`src/server/db/hidden-plugin.ts`) applies the visibility filter.
4. Errors: `toErrorResponse(error)` (`src/shared/errors/to-response.ts`) returns 403 for `AuthorizationError`.

The page counterpart `src/app/(app)/people/page.tsx` line 50 calls `hasPermission("employees.read", organizationId)` and renders `<NoAccessState>` on false.

A mutation in the same file, `POST` (`employees.create`), follows the same pattern and passes `{ userId }` into `HireService.hire`, which writes an audit entry (`src/domains/workforce/`).

### 3.3 Visibility service

- `src/domains/visibility/visibility-service.ts`: `VisibilityService.setHidden` (Super Administrator only, throws otherwise), `hideableTypes`, `isHideable`. Writes an audit record (`record.hidden` / `record.unhidden`).
- Read-side filtering is in `hidden-plugin.ts` (see §2.5). The hide/unhide write uses the raw collection to reach hidden records.

### 3.4 Route coverage

- 114 `route.ts` files under `src/app/api` (count from `find`).
- Routes with no permission helper, and why:
  - `src/app/api/auth/[...nextauth]/route.ts`, `src/app/api/health/route.ts`: public by design.
  - `src/app/api/cron/*`: `CRON_SECRET` (`cron-auth.ts`).
  - `src/app/api/organizations/route.ts`: `requireAuthenticatedUser`, then lists only the user's own organizations.
  - `src/app/api/account/mfa/route.ts`, `src/app/api/account/password/route.ts`: own account; password re-check.
  - `src/app/api/self-service/*`: `requireSelfServiceEmployee` or the self-service session.
  - `src/app/api/settings/security/route.ts`, `src/app/api/deletions/*`, `src/app/api/visibility/route.ts`: `requireAuthenticatedUser`, then a Super Administrator check inside the domain service (see §2.4). The route-level helper is not enough on its own here.

---

## 4. UI authorization

- **Navigation:** `NAV_SECTIONS` in `src/components/shared/nav-links.tsx`. Each item has `permission`, `anyPermission`, `superAdminOnly`, or `tabs`. `canSeeNavItem` filters.
- **Where the permissions come from:** `src/app/(app)/layout.tsx` calls `heldPermissions` and passes `keysInAnyScope(held)` as `heldPermissions` to `WorkspaceLayout` (`src/components/shared/workspace-layout.tsx`). Super Administrator gets `undefined` (no filter).
- **Tabs:** `src/components/shared/module-tabs.tsx` uses the same `visibleTabs` logic.
- **Pages:** a page the viewer cannot open renders `<NoAccessState permission="…" />` (`src/components/shared/no-access-state.tsx`, `no-access-card.tsx`). Example: `src/app/(app)/people/page.tsx`.
- **Buttons:** the page checks each permission on the server (`hasPermission` / `Promise.all` in `src/app/(app)/people/[id]/page.tsx`) and passes booleans down, for example `canCreateAssets` in `src/app/(app)/people/[id]/assets-tab.tsx`. Client components do not check permissions themselves.
- There is no shared `can("…")` helper in `src/` (ENGINEERING §23 allows one; none exists).
- **Test:** `tests/app/nav-permissions.test.tsx`. Checks that each nav item's permission matches the permission its page source contains ("gates every item on the same permission its page checks"), the catalog-read list matches the catalog registry, and NoAccessState text.
- Other related tests: `tests/server/authorization/*.test.ts`, `tests/domains/authorization/*.test.ts`, `tests/domains/identity/*.test.ts`, `tests/security/scan-2026-10.test.ts`.

---

## 5. Checklists

### 5.1 Add a new permission

1. Add `{ key: "<resource>.<action>", description, category }` to `BASELINE_PERMISSIONS` in `scripts/seed.ts`. Keep the `.read/.create/.update` naming.
2. If the key ends in `.delete`: it belongs to the Super Administrator only. The seed strips it from ordinary roles and `RoleService` rejects it on any ordinary role (`src/domains/authorization/super-admin-service.ts` `isDeletePermission`; `role-service.ts` `assertNoDeletePermissions`). Enforce it with the Super Administrator's role or a service check (see `src/domains/deletion/deletion-service.ts`).
3. If the key should make someone an administrator: add it to `ADMIN_PERMISSION_KEYS` in `src/domains/authorization/super-admin-service.ts`.
4. Seed each database: `npm run db:seed` (`scripts/seed.ts`). Until seeded, `RoleService` rejects the key ("not recognized", `assertPermissionKeysValid`). Re-seed adds non-delete keys to the HR Administrator role.
5. Enforce on the server:
   - Route: `requirePermission` / `requireProjectAccess` / `requireAccessibleProjects` from `src/server/authorization/require.ts`.
   - Page: `hasPermission` from `src/app/_shared/has-permission.ts` and `<NoAccessState>`.
   - Button: pass a boolean from the page (pattern in `src/app/(app)/people/[id]/assets-tab.tsx`).
6. Navigation: add the item to `NAV_SECTIONS` (`src/components/shared/nav-links.tsx`) with the same permission. `NAV_PAGES` and the nav test (`tests/app/nav-permissions.test.tsx`) pick it up.
7. Tests: add cases next to `tests/domains/authorization/role-service.test.ts` and `tests/server/authorization/authorize.test.ts`.
8. Docs: if the permission changes a role's meaning, update ARCHITECTURE.md's permission text (ADR-023).

### 5.2 Add a new protected route

1. Zod schema for the body/query in `src/shared/validation/` (see `src/shared/validation/organization.ts`). Always include `organizationId` and validate it.
2. Route file `src/app/api/<name>/route.ts`, following `src/app/api/employees/route.ts`:
   - `try { parse; await requirePermission("<key>", organizationId); … } catch (error) { return toErrorResponse(error); }`
   - Use `requireProjectAccess` / `requireAccessibleProjects` if the data is project-scoped. Filter list results to the returned projects.
   - Call a domain service with `{ userId }`. The service writes `AuditService.record` (`src/server/audit/audit-service.ts`) for every mutation.
3. Destructive actions: service-level Super Administrator check, as in `src/domains/deletion/deletion-service.ts`.
4. Page `src/app/(app)/<name>/page.tsx`: `hasPermission` or `accessibleProjects`, `<NoAccessState>` on denial. Detail routes add `loading.tsx` (ARCHITECTURE "UI standards").
5. If the model holds test-hideable records, add it to `HIDEABLE` (`src/domains/visibility/visibility-service.ts`) and apply `hiddenPlugin` to its schema.
6. Nav entry (§5.1 step 6).
7. Route tests: `tests/app/api/route-handlers.test.ts` (existing pattern). Add a 403 case per permission.
8. No CSRF work is needed: `src/proxy.ts` covers all `/api/*` routes except `/api/auth/` and `/api/cron/`.

---

## 6. Known gaps / mismatches

Each item lists the code location that shows it.

1. **Idle timeout default. Resolved 2026-11-14.** Was 60 seconds in code, against ADR-030's 30 minutes. Now `SESSION_IDLE_MS = 30 * 60_000` in `src/lib/session-idle.ts`, which also feeds `DEFAULTS` in `src/domains/identity/security-settings-service.ts`. The Security form copy is generated from the same constants (`src/app/(app)/settings/security/security-settings-form.tsx`), so it can't drift again.
2. **Session lifetime. Resolved 2026-11-14.** Was 12 hours in code, against ADR-030's 8 hours. Now `DEFAULT_SESSION_MAX_HOURS = 8` in `src/server/auth/inactivity.ts`. The 30-minute `DEFAULT_INACTIVITY_MINUTES` there is the token fallback and matches ADR-030.
3. **ADR-010 says the token carries only `userId`.** The code also stores session state, flags and idle settings (§1.6). Authorization is still not cached in the token, so the principle holds.
4. **ADR-007 status is stale.** It says "foundation only — organization scope; project/unit scope deferred". ADR-043 adds project scope, and `authorize.ts` implements it.
5. **ADR-034 is cited but missing.** Code comments in `src/domains/visibility/visibility-service.ts`, `src/server/db/hidden-plugin.ts` and `src/server/auth/options.ts` refer to ADR-034. No file matches `docs/architecture/adr/ADR-034*`.
6. **Seed comment is stale.** `scripts/seed.ts` (catalog comment, around lines 43–50) says no `.delete` key exists anywhere yet. `leave-types.delete` is seeded (line 94) and enforced (`src/app/api/leave-types/[id]/route.ts` line 40).
7. **Duplicate catalog entries.** `BASELINE_PERMISSIONS` lists `roles.create`, `roles.read`, `roles.update`, `users.read`, `users.update` twice (once under "identity" or "access" headings, around lines 55–57 and 182–185). Seeding upserts them in a `Promise.all` (`upsertPermissionCatalog`). Whether that can hit a unique-key race is unverified; the second description is ignored.
8. **Super Administrator's `permissionKeys` is a snapshot.** `SuperAdminService.ensure()` writes the catalog keys into the role at seed time. `authorize` ignores the list for this role, so access is correct. The stored list does go stale until re-seeded.
9. **No project switcher.** ENGINEERING §24 describes an active-project switcher. Nothing in `src/` matches `ProjectSwitcher` or `switchProject`. `getCurrentOrganization` (`src/app/_shared/get-current-organization.ts`) uses the first accessible organization. Multi-org is noted as later-phase in that file.
10. **Route-level checks missing on some admin routes.** `src/app/api/settings/security/route.ts`, `src/app/api/deletions/*` and `src/app/api/visibility/route.ts` use only `requireAuthenticatedUser`. The Super Administrator check is in the domain service. Works today, but not visible from the route.
11. **WebAuthn is not a sign-in factor.** The ARCHITECTURE "Sign-in security" section lists two-step as TOTP plus recovery codes only. This matches the code. Passkeys are clock-in only (§1.4).
12. **No UI-only `can()` helper.** ENGINEERING §23 allows one. Each page passes booleans instead.
13. **`Permission.isSystem` and `category` are display data.** The ARCHITECTURE note matches the code. `isSystem` is never read.
14. **`hasActiveRoleAssignment` / `requireOrganizationAccess` are unused by routes.** ARCHITECTURE says so; they remain as primitives.

---

## Open questions

- Should the Super Administrator's `permissionKeys` be refreshed on each seed run?
- Is a project switcher (ENGINEERING §24) still wanted now that project scope exists?
- Do the duplicate catalog entries cause any seed failure on a fresh database? (Not tested here.)
