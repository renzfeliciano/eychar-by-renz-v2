# Audit (append-only activity log)

**Purpose:** Append-only record of every mutation, plus the read side used by Settings › Audit log, the dashboard activity feed and each account's security page.
**Governing docs:** ADR-007 (server-side trust boundary); ARCHITECTURE.md § Audit (part of ADR-007); ENGINEERING.md § 35 (audit logging), § 33 (transactions), § 45 (time zone via ADR-045).
**Note on the folder:** `src/domains/audit/` exists on disk but is empty and has no tracked files. The behavior lives in `src/server/audit/` and `src/domains/identity/user-audit.ts`.

**Services:**
- `src/server/audit/audit-service.ts`: `AuditService`
  - `record(input)`: the single-entry write path (`AuditLogModel.create`).
  - `recordMany(inputs)`: batch insert for several entries.
  - No update or delete method, by design (comment, lines 338-342).
- `src/server/audit/audit-query-service.ts`: `AuditQueryService`
  - `list(organizationId, filters)`: newest first; filters `area` (action prefix before the dot), `resourceType`, `actorUserId`, `from`/`to`; page size clamped to 1-100, default 25. Actor names resolved via `userDisplayNames`.
  - `count(organizationId, { actions, from, to })`: counts for the summary tiles.
  - `areas(organizationId)`: distinct action prefixes for the filter menu.
  - `recentSecurityEvents(userId, limit)`: one account's `auth.*` entries (`resourceType: "User"`).
- `src/domains/identity/user-audit.ts`: `auditUserEvent`, the account-security writer (sign-ins, lock-outs, password and two-step changes). Not read in this pass; cited from ARCHITECTURE.md § Audit.

**Models:** `AuditLog`: `src/server/db/models/audit-log.ts` (`timestamp` required, defaults to now, `timestamps: false`; indexes at lines 21-26 on org+timestamp, org+resource, resource+timestamp, org+actor+timestamp). Re-exported from `src/server/db/models/index.ts`.

**Routes:** None. No handler under `src/app/api/` serves audit data. All reads are server-rendered.

**Pages:**
- `src/app/(app)/settings/audit/page.tsx` (gated by `audit-logs.read` via `hasPermission`), with `audit-entry-sheet.tsx` for the detail panel.
- `src/app/(app)/dashboard/page.tsx` (feed of the six latest non-`auth.` entries, line 183).
- `src/app/(app)/account/security/page.tsx` (`recentSecurityEvents`, line 29).
- `src/app/(app)/clearance/[id]/page.tsx` reads `AuditLogModel` directly (line 70); see gaps.

**Tests:** `tests/server/audit/audit-service.test.ts`, `tests/server/audit/audit-query-service.test.ts`.

**Rules a change must respect:**
- Every mutation calls `AuditService.record` (or `recordMany`) after the write. Fields: `organizationId`, `action` as `<area>.<verb>`, `resourceType`, `resourceId`, optional `actorUserId`, `before`, `after`, `metadata` (`audit-service.ts`, `AuditRecordInput`, lines 5-32).
- `resourceId` must be a valid ObjectId: `toEntry` casts it with `new Types.ObjectId` (line 331). A non-ObjectId id throws after the mutation has already been written.
- The `area` filter is the text before the first dot (`audit-query-service.ts` line 44), so keep the `area.verb` shape.
- Actor is optional. Seed, cron and system calls omit it and show as "System" (`AuditQueryService.list`, `actorName`).
- Blocked self-service clock attempts are audited against the Employee record (`self-service-attendance-service.ts`, `assertWithinSite`).
- Reads always filter by `organizationId` (`audit-query-service.ts`, `list`, `count`).
- Do not add update or delete methods to `AuditService`. The comment at lines 338-342 is the contract.

**Known gaps / mismatches:**
- **Date filter uses server-local time.** `from`/`to` become `new Date("YYYY-MM-DDT00:00:00")` (`audit-query-service.ts` lines 49-50 in `list` and the same pattern in `count`). Callers compute "today" with `localDateKey()` in Manila (`src/app/(app)/settings/audit/page.tsx` line 42). On Vercel (UTC) the window is 8 hours off. ADR-045 says calendar dates go through the app-time helpers, not bare local parsing (`docs/architecture/adr/ADR-045-configuration-over-constants.md`, lines 17-19).
- **Append-only is by convention, not enforced.** ARCHITECTURE.md § Audit says "nothing can edit or delete an entry". The model is exported (`models/index.ts` line 7) and nothing in the schema blocks updates. Only the service surface is restricted.
- **Clearance detail bypasses the audit gate.** `clearance/[id]/page.tsx` line 70 queries `AuditLogModel` directly for anyone with `clearance.read`. Settings › Audit log requires `audit-logs.read`. Confirm whether this is intended.
- **Mutations and audit are not atomic.** The entity write and the audit write are separate calls with no transaction (e.g. `asset-issuance-service.ts` 23-42; `clearance-service.ts` 90-119). ENGINEERING.md § 33 asks for transactions only where needed, so this is a decision to record, not necessarily a bug.
- **Exports are not audited.** `api/attendance/export`, `api/attendance/schedules/export` and the attendance export modules contain no `AuditService` call. ENGINEERING.md § 35 does not list exports; confirm the policy.
- The domain folder `src/domains/audit/` is empty. Remove it or document it; the overview's open question 3 is answered by this (no tracked files, behavior in `src/server/audit/`).

**Last verified:** 6587050.
