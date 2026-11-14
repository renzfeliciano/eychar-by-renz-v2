# Cross-cutting concerns (Phase 6)

**Built from commit:** `6587050`. **Last verified:** `6587050`.
**Sources:** docs/ENGINEERING.md §§35, 42–44, 48; ADR-033, ADR-036, ADR-037, ADR-038, ADR-040, ADR-041; ARCHITECTURE.md
(Audit, Brand & installable app, Security hardening, Known gaps). Code wins where they differ. Layer rules are in
`layers.md`.

## 1. Errors and validation messages

- Error types: `src/shared/errors/app-error.ts`. Status map at lines 11–21. Subclasses `AuthenticationError`,
  `AuthorizationError`, `ValidationError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`, `RateLimitError`.
- HTTP mapping: `src/shared/errors/to-response.ts` `toErrorResponse`. See `layers.md` section 5 for the full mapping.
- Zod messages: schemas may hand-write messages (`src/shared/validation/shared.ts`, e.g. `remarksSchema` with
  `REMARKS_MAX_LENGTH = 200`, line 20–22). `to-response.ts` keeps hand-written messages and rewrites only Zod's
  default ones ("Too small", "Invalid input", "received NaN") into "X is required" / "X must be a number" /
  "X must be at least N".
- Reusable field rules: `src/shared/validation/shared.ts` (`clearable`, `contactNumberSchema`, `emailSchema`,
  `sssNumberSchema`, etc.) and `src/shared/validation/object-id.ts` (`OBJECT_ID_PATTERN`, `objectId()`). The same schemas run
  in the browser before the request (`src/app/(app)/people/[id]/edit-employee-dialog.tsx:107`).
- Field routing on the client: `src/lib/field-errors.ts` `splitApiError` sends `{ error, field }` to a field or to the form.
- Logs: `describeErrorForLog` in `to-response.ts` keeps name, code, message and stack, and redacts `keyValue` and
  `keyPattern` (PII) and the `dup key` value.
- Tests: `tests/shared/errors/to-response.test.ts`.
- Gaps: see section 11 (malformed JSON returns 500; `"database"` kind unused).

## 2. Dates and time zones

Three modules, one rule per kind of value:

| Kind of value | How it is stored | How it is read | Module |
|---|---|---|---|
| Instant (createdAt, audit timestamps, clock events) | UTC `Date` | Manila wall clock via `formatDateTime`, `formatDate`, `formatTime`, `clockTime`, `minutesOfDayInAppZone` | `src/lib/app-time.ts` |
| Calendar day ("2026-10-01") | UTC midnight `Date` (`dateKeyToDate`) | UTC: `formatCalendarDate`, `formatDateKey`, `formatDateRange` | `src/lib/date-key.ts` |
| "Today" as a day key | derived | `localDateKey()` = `appDateKey()` in Manila | `src/lib/date-key.ts:localDateKey`, `src/lib/app-time.ts:appDateKey` |

- Zone: `APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim() || "Asia/Manila"` (`src/lib/app-time.ts:8`).
  The server runs in UTC on Vercel, so every display goes through this constant, not the process zone.
- `zonedInstant(dateKey, time)` (`app-time.ts`, line 49) turns a Manila wall time into an instant, using the zone's offset.
- `dateToDateKey` uses `toISOString()` (UTC), which matches the UTC-midnight storage (`date-key.ts`).
- Display presets: `DATE_TIME_STYLES` in `app-time.ts`. ARCHITECTURE.md line 607–608 repeats the rule (ADR-045).
- Cron: `vercel.json` schedules are UTC: `"5 16 * * *"` is 00:05 Manila and `"20 17 * * *"` is 01:20 Manila. The
  payroll job decides "due" with `localDateKey()` (`src/domains/payroll/payroll-schedule-service.ts:117`), so it is
  Manila-based. README.md lines 49–50 state the Manila times.
- Age and tenure: `src/lib/employee-dates.ts` `calculateAge` and `formatLengthOfService` read `getFullYear/getMonth/getDate`
  (local time, lines 2–14). Their inputs are UTC-midnight calendar dates (`birthDate` from `z.coerce.date`,
  `src/shared/validation/workforce.ts:48`). Callers: `src/app/(app)/people/page.tsx:240,246` and
  `src/app/(app)/dashboard/page.tsx:395`. The result is wrong by one day in any process whose local zone is west of UTC.
  It is latent because the server runs in UTC, and `vitest.config.ts:7` forces `TZ=UTC`, so tests cannot catch it.
- Tests: `tests/lib/app-time.test.ts`. No test file exists for `date-key.ts` or `employee-dates.ts`.

## 3. Money

- `src/lib/money.ts`:
  - `roundMoney(value)` (line 12): centavo rounding, half away from zero. Scales by 100 and re-reads at 12 significant
    digits first to remove float noise.
  - `formatMoney(value)`: `en-PH` PHP, two decimals (`₱1,234.50`). `formatAmount(value)`: the same number without the symbol.
  - The currency is a single constant (`MONEY_FORMAT`, line 23).
- Payroll and settlement math import from `src/domains/payroll/engine/money.ts`, which re-exports `roundMoney` and adds
  `sumMoney` (rounds the total). Importers include `payroll/engine/compute-pay.ts:3`, `payroll/engine/contributions.ts:1`,
  `payroll/payroll-run-service.ts:17`, `payroll/payroll-run-compute.ts:24` and
  `final-settlement/settlement-calculator.ts:1`. No file imports `@/lib/money` directly.
- Tax: `src/domains/payroll/payroll-tax.ts` `computeProgressiveBracketTax` (line 10). Test:
  `tests/domains/payroll/payroll-tax.test.ts`.
- Storage type: plain JS `Number`, not Decimal128. For example `PayrollRecord.amount` (`src/server/db/models/payroll-record.ts:7,17`).
  `git grep` finds no `Decimal128` in `src/`.
- Tests: `tests/lib/money.test.ts`.
- Gaps: see section 11 (float arithmetic, and `sumMoney` rounds only the total).

## 4. Audit logging

- Write path: `src/server/audit/audit-service.ts`. `AuditService.record` (one `create`) and `recordMany` (one `insertMany`).
  These are the only exported writers. There is no update or delete.
- Identity events: `src/domains/identity/user-audit.ts:21` `auditUserEvent` calls `AuditService.record` with
  `resourceType: "User"` (line 24) and files the entry under the account's organization.
- Callers: 55 files reference `AuditService.record`, `recordMany` or `auditUserEvent` (`git grep -c`).
- Model: `src/server/db/models/audit-log.ts`. Fields: `organizationId`, `actorUserId`, `action`, `resourceType`, `resourceId`,
  `timestamp` (default now), `before`, `after`, `metadata`. Indexes at lines 21–26. No TTL index. `timestamps: false`.
- Read path: `src/server/audit/audit-query-service.ts` (`list`, paged; `recentSecurityEvents`, line ~103). UI:
  `src/app/(app)/settings/audit/page.tsx` and `audit-entry-sheet.tsx`, gated by `audit-logs.read`. Each person's own
  recent security events appear on `src/app/(app)/account/security/page.tsx`. The clearance page reads `AuditLogModel`
  directly (`src/app/(app)/clearance/[id]/page.tsx:70`).
- `src/domains/audit/` is an **empty directory on disk**. Git tracks no file in it, and `git status` shows no untracked
  file there (only `knowledge/`). This answers overview.md open question 3: it is a leftover, and the audit code lives in
  `src/server/audit/` and `src/domains/identity/user-audit.ts`.
- Timing: audit is written after the mutation (and after any transaction commits), per ADR-041. A crash between the write
  and the audit call loses the audit entry.
- Enforcement: append-only by convention (the service exposes no update or delete). The database does not enforce it.
  ENGINEERING §35 asks that entries not be editable through normal UI, which the code meets.
- PII in entries: `PersonService.update` writes `before` (name, email, phone, birthDate, address, sssNumber, philHealthNumber,
  pagIbigNumber, tinNumber) and `after: patch` (`src/domains/people/person-service.ts:114–115`). Anyone with
  `audit-logs.read` can see these values. See section 11.

## 5. File and object storage

- Seam: `src/server/storage/document-storage.ts` (`DocumentStorage.save/read/remove`) and
  `src/server/storage/attendance-photo-storage.ts` (`AttendancePhotoStorage.save/read/remove`). Domain services call these,
  not the Blob SDK.
- Switch: `objectStorageEnabled()` (`document-storage.ts`) is true when `BLOB_READ_WRITE_TOKEN` is set. Attendance photos
  use the same check.
- Vercel Blob (ADR-038): `put` with `access: "private"`, `addRandomSuffix: false`. Keys:
  `employee-documents/<orgId>/<employeeId>/<uuid>` (no file name) and `attendance-photos/<orgId>/<employeeId>/<uuid>.jpg`.
  Reads use `get(..., { access: "private", useCache: false })`. Nothing is served by URL; downloads go through
  `src/app/api/employees/[id]/documents/[documentId]/route.ts`, which uses `src/app/_shared/file-response.ts`.
- Fallback (ADR-038): with no token, documents stay as base64 in `EmployeeDocument.fileData` and photos as a data URL in
  `AttendanceRecord.photo` (`src/server/db/models/attendance-record.ts:20–24`). Old records use this shape and are still read.
- Photo type check: `decodeJpegDataUrl` (`attendance-photo-storage.ts`) accepts only a `data:image/jpeg;base64,` URL whose
  bytes start with the JPEG magic `FF D8 FF`.
- Size and type: `MAX_DOCUMENT_BYTES = 4 MiB` (`src/domains/documents/file-check.ts:6`). Upload limits are in ADR-038.
- Migration: `src/server/storage/attendance-photo-migration.ts` and `scripts/migrate-attendance-photos.ts`. An explicit
  backfill, not automatic.
- Purge: `DeletionService.purge` removes Blob files after the transaction commits, best effort. Missing blobs are ignored.
  See section 9.
- Tests: `tests/server/storage/document-storage.test.ts`. No test file for `attendance-photo-storage.ts`.

## 6. Background jobs

- Schedules: `vercel.json` (7 lines). `/api/cron/payroll-schedules` daily, `/api/cron/recycle-bin` daily.
- Payroll (`src/app/api/cron/payroll-schedules/route.ts`): calls `PayrollScheduleService.prepareDueBatch`
  (`src/domains/payroll/payroll-schedule-service.ts:115`). It prepares at most `PREPARE_LIMIT_PER_PASS = 3` runs per pass
  (line 23) and returns `{ outcomes, remaining }`. The payroll page does the same catch-up on each visit.
- Recycle bin (`src/app/api/cron/recycle-bin/route.ts`): calls `DeletionService.purgeExpired()`
  (`src/domains/deletion/deletion-service.ts`). The Recycle bin page also purges on open.
- Auth: `src/server/security/cron-auth.ts` `checkCronAuthorization`. Compares `Bearer <CRON_SECRET>` by SHA-256 digest and
  `timingSafeEqual`. Returns 503 when `CRON_SECRET` is unset and 401 on mismatch. The origin check exempts `/api/cron/`
  (`src/server/security/csrf.ts`, `EXEMPT_PREFIXES`).
- No queue or worker (ENGINEERING §44; ARCHITECTURE "no message broker"). Each job runs inside one HTTP invocation.
- Tests: `tests/server/security/cron-auth.test.ts`. No route-level test for either cron route was found.

## 7. Security headers and CSP

- Static headers: `next.config.ts` (`securityHeaders`, lines 8–20; `headers()` at line 25). `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(self), microphone=(), geolocation=(self)`, HSTS only in production, `Cross-Origin-Opener-Policy: same-origin`.
  `poweredByHeader: false`.
- Per path: `/api/*` gets `X-Robots-Tag: noindex, nofollow`. `/sw.js` gets `no-cache, no-store, must-revalidate`,
  `Service-Worker-Allowed: /` and its own CSP `default-src 'self'; script-src 'self'`.
- Page CSP: `src/server/security/csp.ts` `buildContentSecurityPolicy(nonce)`. `script-src 'self' 'nonce-…' 'strict-dynamic'
  'wasm-unsafe-eval'` (dev adds `'unsafe-eval'`). `style-src 'self' 'unsafe-inline'` (React `style` attributes need it).
  `img-src` and `media-src` allow `blob:`/`data:`. `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `upgrade-insecure-requests` in production. `createNonce()` gives 128 random bits.
- Applied by `src/proxy.ts` (production only, line 18). Not set in `next.config.ts` (its comment, lines 5–6, explains why).
- Origin check: `src/server/security/csrf.ts` `checkRequestOrigin`. Non-safe methods on `/api/*` are refused when
  `Sec-Fetch-Site` is cross-site or `Origin` or `Referer` is foreign. Allowed origin is `NEXTAUTH_URL`.
- Rate limits: `src/server/security/rate-limit.ts` `RATE_LIMITS` (lines 14–23): exports 30 per 10 min, payroll runs 10,
  bulk changes 20, password checks 8 per 15 min, uploads 30, payroll recalculations 60, bulk previews 60. Stored in
  `LoginThrottleModel` under `rl:` keys. Over the limit it throws `RateLimitError`, which becomes 429 with `Retry-After`.
- Tests: `tests/server/security/csp.test.ts`, `tests/server/security/csrf.test.ts`, `tests/security/route-guards.test.ts`.
  No test covers `src/proxy.ts` itself.

## 8. PWA and service worker

- Manifest: `src/app/manifest.ts` (served at `/manifest.webmanifest`). `id: "/"`, `display: standalone`, theme `#173567`,
  four icons under `/icons/` (present in `public/icons/`), shortcuts to `/clock`, `/attendance/schedules`, `/people`.
- Service worker: `public/sw.js`, hand-written (ADR-036). `VERSION = "v2"` (line 12) names the cache `pcas-hris-static-v2`.
  - Install precaches `/offline.html` and two icons, then `skipWaiting`.
  - Activate deletes older `pcas-hris-*` caches.
  - Fetch: `/api/*` and cross-origin requests are not handled. Navigations always go to the network, with `/offline.html`
    as the fallback. `/_next/static/`, `/icons/` and `/assets/` are cache-first and filled as used (only `response.ok` and
    `type === "basic"`).
- Registration: `src/components/shared/service-worker-register.tsx:12–13`. Production only, scope `/`, `updateViaCache: "none"`.
- Assets: `public/offline.html`, `public/icons/*` (4 PNG), `public/assets/` (11 files: login backgrounds and loader images).
- Policy (ADR-036 and ARCHITECTURE "Brand & installable app"): never cache pages or `/api` (personal and payroll data).
- Tests: none for `sw.js` or the manifest.
- Gaps: see section 11 (`/assets/` is not fingerprinted; offline cannot be exercised in dev).

## 9. Soft delete and recycle bin (ADR-033)

- "Soft delete" here means moving data, not flagging it. A delete copies each document into `DeletedRecord`
  (`src/server/db/models/deleted-record.ts`), removes it from the live collection, and records a `DeletionBatch`
  (`src/server/db/models/deletion-batch.ts`) with `status` (`in_bin`, `restored`, `purged`), `purgeAfter` (30 days) and a
  summary. `RECYCLE_BIN_DAYS = 30` (`src/domains/deletion/deletion-service.ts:16`).
- Plans: `src/domains/deletion/deletion-registry.ts` (256 lines). Each type lists `deletes` (moved to the bin), `patches`
  (`$pull` or `$unset` on records that stay, reversed on restore) and `blockers` (refuse). Shared setup such as positions and
  leave types uses `whileUnused`. Employee documents are a deletable type (line 248).
- Service: `DeletionService` in `deletion-service.ts`: `preview`, `remove`, `restore`, `purgeNow`, `purgeExpired`, `listBin`.
  - Super Administrator only (`assertSuperAdmin`), through `SuperAdminService.isSuperAdmin`.
  - `remove` needs the exact label typed in `confirm`. Self-deletion of a staff account is blocked.
  - `remove`, `restore` and `purge` each run in `withTransaction`. `claimBatch` is a conditional update on `status: "in_bin"`
    as the first write, so a racing restore and purge cannot both win.
  - Audit after commit: `record.deleted`, `record.restored`, `record.purged`.
- Blob cleanup: `purge` collects Blob keys from `storedFilesOf` (documents and clock photos) inside the transaction and deletes
  them after commit, ignoring errors.
- Routes: `src/app/api/deletions/route.ts`, `deletions/preview/route.ts`, `deletions/[batchId]/route.ts`. Cron:
  `src/app/api/cron/recycle-bin/route.ts`.
- Tests: `tests/domains/deletion/deletion-service.test.ts`, `cross-organization-deletion.test.ts`, `performance-deletion.test.ts`.

## 10. Transactions (ADR-041)

- `src/server/db/transaction.ts` `withTransaction(work)` wraps `mongoose.connection.transaction`. It commits when `work`
  resolves, aborts when it throws, and retries transient errors, so `work` must be safe to run again (compute first, then write).
- Call sites (8 calls in 6 files): `domains/deletion/deletion-service.ts` (remove, restore, purge),
  `domains/final-settlement/final-settlement-service.ts:294`, `domains/payroll/compensation-service.ts:282`,
  `domains/payroll/payroll-run-compute.ts:297`, `domains/payroll/payroll-run-service.ts:85`,
  `domains/workforce/employee-assignment-service.ts:153`.
- Rules (doc comment in `transaction.ts`): wrap only the group of writes that must not split. Every operation inside passes
  `{ session }`; one that doesn't runs outside the transaction. Audit is written after commit.
- Tests: `tests/server/db/transaction.test.ts`. Concurrency tests: `tests/security/` (ARCHITECTURE "Known gaps": they need a
  replica set).
- Not using a transaction (by design): the employee profile PATCH (see `layers.md` G3), hire (ARCHITECTURE line 88).

## 11. Known gaps and mismatches

1. **Malformed JSON returns 500.** `request.json()` throws `SyntaxError` in route handlers (for example
   `src/app/api/employees/[id]/route.ts:27`). `toErrorResponse` (`to-response.ts`) only handles `AppError`, `ZodError`,
   Cast/BSON errors, so it logs "Unexpected error" and returns 500.
2. **`AppErrorKind` `"database"`** (`app-error.ts:9`) is declared and mapped to 500 but never constructed.
3. **Audit contains PII.** `person-service.ts:114–115` records full before/after values, including statutory IDs and birth
   date. Intent is not documented (Q1).
4. **Latent date bug.** `employee-dates.ts` uses local getters on UTC-midnight dates (section 2). Not caught by tests (`TZ=UTC`).
5. **Float money.** `Number` amounts. `roundMoney` runs where the engine calls it, and `sumMoney` rounds only the total (section 3).
6. **ADR-038 is stale on documents.** It says "documents still have no delete". ADR-033's deletion registry now deletes
   `employee-document` (`deletion-registry.ts:248`), and purge removes its Blob. ADR-038 also does not mention attendance photos.
7. **ADR-041 call-site list** does not name `compensation-service.ts:282`, although it is a transaction call site.
8. **ARCHITECTURE line 139** says photos are "stored as base64 in MongoDB". Code stores them in Blob when the token is set
   (see `layers.md` G8).
9. **ADR-036 vs code:** ADR says the worker caches "fingerprinted static assets". `sw.js:45` also caches `/assets/`, and
   `public/assets/` files are not fingerprinted (e.g. `images/login/pcas-login-bg-1.jpg`). A changed file at the same URL
   can be served stale from cache until `VERSION` is bumped.
10. **Recycle-bin purge is unbounded.** `DeletionService.purgeExpired` loops over every expired batch in one request
    (`deletion-service.ts`, ~line 166), unlike the payroll job, which caps at 3 (`PREPARE_LIMIT_PER_PASS`).
11. **Orphan risk.** `DocumentStorage.save` runs before `EmployeeDocumentModel.create`
    (`src/domains/documents/employee-document-service.ts:36–37`), and the attendance photo is saved before its record
    (`self-service-attendance-service.ts:121, 178`). If the record write fails, the blob is orphaned. No cleanup path for that case was found.
12. **Untested:** `src/lib/date-key.ts`, `src/lib/employee-dates.ts`, `src/server/storage/attendance-photo-storage.ts`,
    `src/proxy.ts`, `public/sw.js`, both cron routes.
13. **Missing ARCHITECTURE headings.** The task's list named "API", "Storage" and "PWA" sections. They do not exist; the
    matching text is under "Brand & installable app (ADR-036)" and "Security hardening (ADR-037)".

## 12. Open questions

- **Q1.** Are full PII values in `person.updated` before/after intended? If not, record only changed field names.
- **Q2.** Is a Vercel Blob store connected to production (`BLOB_READ_WRITE_TOKEN`)? This cannot be verified from the repo,
  and `.env.local` was deliberately not read. Without it, documents and photos stay inline in MongoDB, which ADR-038 was written to avoid.
- **Q3.** Should `employee-dates.ts` switch to UTC getters for calendar dates, to match `date-key.ts`?
- **Q4.** Should `/assets/` leave the cache-first list, or should the app use hashed filenames as ADR-036 assumes?
