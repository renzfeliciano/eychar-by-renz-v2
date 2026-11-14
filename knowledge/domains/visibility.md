# Visibility (hidden test data)

**Purpose:** lets the Super Administrator hide test records (employees, positions, cases, travel orders and others) so they disappear from every other user's reads, without deleting them. The hide flag is `hiddenFromOthers`, enforced by a Mongoose plugin, so it cannot be forgotten in one query.
**Governing docs:** ADR-034 (**file missing from `docs/architecture/adr/`**; cited in code), ADR-040 (security review, line 56 mentions ADR-034 and says "revisit with several organizations"), ADR-020 (self-service sign-in, the self-service viewer rule), ENGINEERING.md § 19-22 (identity and RBAC), § 35 (audit). ARCHITECTURE.md has no visibility section.
**Services:**
- `src/domains/visibility/visibility-service.ts`: `VisibilityService.setHidden(type, id, organizationId, hidden, actor)`, `hideableTypes()`, `isHideable(type)`. Module-private `HIDEABLE` map (type to model) and `isMemberOf`.
- `src/server/db/hidden-plugin.ts`: `hiddenPlugin(schema)`, a schema plugin that adds the field and the query scope.
- `src/server/db/visibility-context.ts`: `viewerSeesHidden()`, reads the next-auth session cookie inside a request. Returns false outside a request (jobs, scripts, tests).
- `src/server/auth/token-visibility.ts`: `tokenSeesHidden(token)`, checks the token's `seesHidden` flag and that the session is not expired, idle, or past its lifetime.
- `src/server/auth/options.ts` (line 34): `viewerMaySeeHidden(userId, employeeId)`, sets `token.seesHidden` at sign-in and on refresh (lines 134, 147, 181, 200).
- `src/domains/authorization/super-admin-service.ts`: `SuperAdminService.isSuperAdmin(userId, orgId)` and `isSuperAdminAnywhere(userId)`.

**Models:**
- Plugin applied (16): `applicant`, `case`, `clearance-case`, `day-note`, `employee`, `evaluation-follow-up`, `event`, `final-settlement`, `holiday`, `leave-type`, `location`, `organization-unit`, `position`, `project`, `shift-template`, `travel-order` (`src/server/db/models/*.ts`, each with `plugin(hiddenPlugin)`).
- Own field, no plugin: `user.ts` line 20 (`UserModel.hiddenFromOthers`, used for the `staff-account` type).
- No plugin, so not hideable through the query scope: `employment`, `employee-assignment`, `payroll-record`, `attendance-record`, `leave-request`, `performance-evaluation`, `performance-review`, `review-cycle`, `person`, `evaluator-rule`.

**Routes:**
- `src/app/api/visibility/route.ts`: POST `{ organizationId, type, id, hidden }`. Auth is `requireAuthenticatedUser()` only. The Super Administrator check is in the service.

**Pages and components:**
- `src/components/shared/hide-toggle.tsx` (`HideToggle`), shown only to Super Administrators (`superAdmin &&` in each page). Used in `cases/page.tsx`, `clearance/[id]/page.tsx`, `final-settlements/[id]/page.tsx`, `leave/types/page.tsx`, `organization/locations/page.tsx`, `organization/positions/page.tsx`, `organization/projects/page.tsx`, `organization/units/page.tsx`, `people/[id]/page.tsx`, `travel-orders/page.tsx`.
- Readers of the flag that do not use the plugin: `src/domains/attendance/schedule-service.ts` (line 281), `src/domains/authorization/role-assignment-service.ts` (line 170), `src/domains/identity/account-security-service.ts` (line 134).

**Tests:**
- `tests/domains/visibility/visibility-service.test.ts` (hide, unhide, audit, Super Administrator only, covers projects and other types)
- `tests/domains/visibility/cross-organization-visibility.test.ts` (staff-account hiding stays inside the organization; rejects inherited object keys as type)
- `tests/app/hide-toggle.test.tsx`, `tests/app/hide-toggle-undo.test.tsx`

**Rules a change must respect:**
- Only the Super Administrator can hide or unhide (`visibility-service.ts`, `setHidden`, `SuperAdminService.isSuperAdmin`). The route does not repeat the check.
- Writes go to the raw collection (`model.collection.updateOne`, line 260) so that a hidden record stays reachable to the Super Administrator's own hide action. Any new hide path must do the same, or it will not find the hidden record.
- A type becomes hideable only by adding it to `HIDEABLE` (`visibility-service.ts` lines 208-223). Lookups use `Object.hasOwn`, which blocks inherited keys (line 244, 252). Keep that.
- Staff accounts: a user cannot hide their own account (line 257). The account must hold an active role in this organization (`isMemberOf`, line 259), so one organization cannot hide another's account.
- Plugin query scope (`hidden-plugin.ts`): `find`, `findOne`, `countDocuments`, `distinct`, `findOneAndUpdate`, `updateOne`, `updateMany` are scoped. `aggregate` gets a leading `$match`. The scope is skipped when the query carries `includeHidden: true` (used by `assertInOrganization`, `src/server/db/assert-in-organization.ts` line 27, and the role-assignment service) or when the filter already contains `hiddenFromOthers` (line 14). Any caller that passes that key in a filter reads hidden records. Review such callers.
- Who sees hidden records is decided by the signed session token, not a database lookup (`visibility-context.ts` lines 6-13; `token-visibility.ts`). An expired, idle, or past-lifetime token sees nothing hidden.
- Jobs and scripts see no hidden records (no request, `viewerSeesHidden` returns false). Keep it that way for cron jobs (`src/app/api/cron/*`).
- Raw `Model.collection` access and `$lookup` into a collection bypass the plugin. `EmployeeRosterService.page` starts from the Employee collection, so the scope applies there, but a `$lookup` into another collection does not.

**Known gaps / mismatches:**
- **ADR-034 is cited in code and missing from the docs.** Files that cite it include `visibility-service.ts` (line 205), `hidden-plugin.ts` (line 5), `options.ts` (line 33), and the route. The ADR-040 mention (line 56) says multi-organization scope is "revisit then", but no document records the decision.
- **Hiding an employee does not hide their other records.** `employment`, `employee-assignment`, `payroll-record`, `attendance-record`, and `leave-request` have no plugin (grep of `src/server/db/models`), so a hidden test employee still appears in payroll runs, attendance and leave lists, and their Employment and Assignment history. Confirm this is intended.
- **Viewer rule is broader than the comment.** `viewerMaySeeHidden` returns true for any account with an `employeeId`, not only self-service accounts (`options.ts` lines 34-36). `visibility-context.ts` describes the rule as "a self-service user (who only ever reads their own records)". Check that no account with `employeeId` also holds org-wide read permissions.
- `PersonModel` has no hidden field. Persons reachable only through a hidden Employee are not separately hidden.
- `hideableTypes()` and `isHideable()` are exported, but no caller in `src` uses them (grep). They are dead code, or intended for a future UI.

**Last verified:** 6587050.
