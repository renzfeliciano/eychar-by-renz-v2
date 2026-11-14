# Layers and boundaries (Phase 1)

**Built from commit:** `6587050`. **Last verified:** `6587050`.
**Sources:** ARCHITECTURE.md (Directory structure, Brand & installable app ADR-036, Security hardening ADR-037, Audit),
docs/ENGINEERING.md §§4, 36–40, ADR-001, ADR-037, ADR-041. Code wins where they differ (see the last section).

## 1. Layer map

```
Browser
  Server Components   src/app/(app)/**/page.tsx, layout.tsx      read data (services, or models in 3 files)
  Client Components   files with "use client" (143)               fetch() to /api/*, toast, router.refresh()
  Service worker      public/sw.js                                static assets and offline page only
        | HTTP
src/proxy.ts         /api/*: cross-site origin check (src/server/security/csrf.ts)
                     pages: per-request CSP nonce (src/server/security/csp.ts), production only
        |
src/app/api/**/route.ts   (114 route files)   parse -> authenticate/authorize -> domain call -> toErrorResponse
        |
src/domains/<domain>/*-service.ts  (23 folders)  rules, withTransaction, AuditService.record, AppError throws
        |
src/server/db/models/*.ts (Mongoose), src/server/audit, src/server/storage, src/server/authorization, src/server/auth
        |
MongoDB (Atlas), Vercel Blob (private, when BLOB_READ_WRITE_TOKEN is set)
```

Cross-layer, pure modules (no DB, no `next/*`): `src/shared/validation/*` (Zod), `src/shared/errors/*`, `src/lib/*`.

## 2. Representative write path: `PATCH /api/employees/[id]`

Client caller: `src/app/(app)/people/[id]/edit-employee-dialog.tsx:111` sends `organizationId` and every field in the
body. It pre-checks `remarksSchema` (line 107) so the same rule runs in the browser. On success it toasts and calls
`router.refresh()` (lines 146–147).

Route: `src/app/api/employees/[id]/route.ts`, `PATCH` (lines 24–63). Step by step:

| Step | Where | What happens |
|---|---|---|
| Validate | route line 27; `src/shared/validation/workforce.ts:40` (`updateEmployeeProfileSchema`) | `request.json()` parsed by Zod. `organizationId` via `objectId()`; blank-means-clear via `clearable()`. |
| Authenticate | `src/server/authorization/require.ts:34` (`requireAuthenticatedUser`), called from `requirePermission` (line 54) | Session from `getSession()` (`src/server/auth/session.ts:15`). Refuses accounts with `mustChangePassword` or `mustSetUpTwoStep`. |
| Authorize | route line 28; `require.ts:54` then `src/server/authorization/authorize.ts:39` (`authorize`) | Permission `employees.update` checked against the org in the body. |
| Resolve context | route line 28 | No context object. The org id comes from the validated body and is used in every query filter. |
| Read for existence | route lines 30–31 → `EmployeeService.getDetail` (`src/domains/workforce/employee-service.ts`) | Org-scoped `findOne`. Route checks `current.person` and throws `NotFoundError` if missing. |
| Domain write 1 | route line 33 → `PersonService.update` (`src/domains/people/person-service.ts`) | Reads `before`, builds `$set`/`$unset` (empty string = clear), `findOneAndUpdate` filtered by org. |
| Audit 1 | `person-service.ts` `update` → `AuditService.record` (`src/server/audit/audit-service.ts`) | `action: "person.updated"`, with `before` and `after`. |
| Domain write 2 | route line 55 → `EmployeeService.update` (only if `employeeNumber` is sent) | `findOneAndUpdate` filtered by org. Duplicate key becomes `ConflictError` (`isDuplicateKeyError`). |
| Audit 2 | `employee-service.ts` `update` → `AuditService.record` | `action: "employee.updated"`. |
| Transaction | none | Both writes run outside `withTransaction` (`src/server/db/transaction.ts`). See gap G3. |
| Persist | `src/server/db/models/person.ts`, `employee.ts`, `audit-log.ts` | `AuditService.record` / `recordMany` are the only audit write paths (`create` / `insertMany`). |
| Response | route line 59 `NextResponse.json({ detail })`; any throw → `toErrorResponse` (`src/shared/errors/to-response.ts`) | Errors map to HTTP status, see section 5. |

Most write routes follow this shape. `git grep -l "domains/" src/app/api` matches 112 of 114 route files (the
exception is `src/app/api/health/route.ts`). No route imports `src/server/db/models` or `mongoose` directly.

## 3. Layer rules (what the code does, with the files that show it)

**Route handler (`src/app/api/**/route.ts`)**
- May: read `request.nextUrl` and `request.json()`; parse with Zod from `src/shared/validation`; call
  `requirePermission`, `requireSelfServiceEmployee`, `requireOrganizationAccess`, `requireProjectAccess`,
  `requireAccessibleProjects` (`src/server/authorization/require.ts`); call one domain service; return
  `NextResponse`; use `toErrorResponse` in `catch`.
- Must not (rule, ENGINEERING §37): hold business rules. Current exception: the PATCH above reads the record and checks
  `current.person` itself (gap G4).
- Must not (rule, §36): authorize before authenticating. Current exception: body validation runs before
  authentication in PATCH (gap G2).

**Domain service (`src/domains/<domain>/*-service.ts`)**
- May: import `connectMongoDB`, models from `@/server/db/models`, `AuditService`, `withTransaction`, `AppError`
  subclasses from `@/shared/errors`.
- Must (observed in the code): scope every query by `organizationId` (e.g. `employee-service.ts` `update`);
  throw typed errors (`NotFoundError`, `ConflictError`, `BusinessRuleError`, `ValidationError`); write one audit
  record per mutation via `AuditService.record` (ADR-041 says audit is written after commit, outside the transaction);
  compute before opening a transaction, then write (`src/server/db/transaction.ts` doc comment; ADR-041).
- Must not: import `next/*` or `NextRequest`. Verified: no such import in `src/domains`. One exception:
  `employee-service.ts:1` imports `cache` from `react` (request memoization).
- Must not import from `src/app`. Verified: no matches.

**Server infrastructure (`src/server/**`)**
- Folders: `db/` (63 models in `db/models/`, plus `index.ts` and `simple-catalog-schema.ts`, `connection.ts`, `transaction.ts`, `assert-in-organization.ts`),
  `auth/` (NextAuth v4 options and session helpers), `authorization/` (`authorize.ts`, `require.ts`), `audit/`,
  `security/` (csrf, csp, cron-auth, rate-limit), `storage/` (documents, attendance photos), `policies/`.
- Intended direction: server to shared and lib only. Actual inversions are listed in gap G5.

**Pages and layouts (`src/app/(app)/**`)**
- Server Components by default. Auth gate in `src/app/(app)/layout.tsx:22` (`redirect("/login")`), not in the proxy.
- Five files import `src/server/db/models` directly: three under `(app)` (`layout.tsx:4`,
  `account/security/page.tsx:5`, `clearance/[id]/page.tsx:70`) and two in other route groups. Not forbidden by
  ENGINEERING §39, but it bypasses the domain layer (gap G6).
- Some pages call `src/server/audit/audit-query-service.ts` (`account/security/page.tsx:6`).

**Client components (`"use client"`, 143 files)**
- May import: `react`, `next-auth/react` (`signIn`, `signOut`, `useSession`, e.g. `components/shared/idle-session-guard.tsx`),
  `sonner`, `src/components/ui`, `src/components/shared`, pure `src/lib/*`, pure `src/shared/validation/*`.
- May import, types only: `import type` from service modules, which is erased at build. Examples:
  `(app)/organization/chart/org-chart-canvas.tsx:29`, `(self-service)/clock/clock-panel.tsx:16`,
  `(app)/people/people-export-actions.tsx:7`.
- May import, runtime values from pure domain modules: `domains/holidays/holiday-types`, `domains/attendance/shift-colors`,
  `domains/workforce/org-chart-tree`, `domains/events/calendar`, `domains/clearance/clearance-sources`.
- Must not import at runtime: `src/server/*`, `mongoose`, or any `*-service.ts`. Verified: the only service imports from client files are `import type`.

**Shared UI (`src/components/shared`)**
- Presentation only, with one exception: `no-access-state.tsx` has no `"use client"`, imports `connectMongoDB` and
  `RoleAssignmentService` (lines 2–5) and is a server component (gap G7).

## 4. `src/proxy.ts` (63 lines)

- Next.js 16 "proxy" (formerly middleware). Exports `proxy` (line 16) and `config.matcher` (lines 49–63).
- `/api/*` (all methods): `checkApiOrigin` calls `checkRequestOrigin` (`src/server/security/csrf.ts`). Safe methods pass.
  `/api/auth/*` and `/api/cron/*` are exempt. Cross-site or foreign-origin writes get 403. Allowed origin is `NEXTAUTH_URL`.
- Pages: matcher excludes `api/`, `_next/static`, `_next/image`, icons, `sw.js`, `offline.html`, `manifest.webmanifest`,
  robots, sitemap, favicon, and next/link prefetches (lines 50–62). Production only (line 18): a nonce from `createNonce()`
  goes into the request and response CSP headers via `buildContentSecurityPolicy` (`src/server/security/csp.ts`).
  Development returns `NextResponse.next()` with no CSP.
- Does not authenticate or authorize (its own comment, lines 9–13). It has no session check at all. The auth
  redirect lives in `(app)/layout.tsx`, and each route calls `requirePermission`.

## 5. Errors and how they become HTTP responses

- `src/shared/errors/app-error.ts`: `AppError(kind, message, details?)`. `STATUS_BY_KIND` (lines 12–22) maps:
  `authentication` 401, `authorization` 403, `validation` 400, `not_found` 404, `conflict` 409, `business_rule` 422,
  `rate_limited` 429, `database` 500, `unexpected` 500. Subclasses: `AuthenticationError`, `AuthorizationError`,
  `ValidationError`, `NotFoundError`, `ConflictError`, `BusinessRuleError`, `RateLimitError` (adds `retryAfterSeconds`).
- `src/shared/errors/to-response.ts` `toErrorResponse(error)` is the single chokepoint (ENGINEERING §48):
  - `AppError`: `{ error, details }` at its status. `RateLimitError` adds `Retry-After`.
  - `ZodError`: 400 `{ error, field, details: flatten() }`. `error` is the first issue, humanized (`describeZodError`).
  - `CastError` / `BSONError` (bad id or date): 400 with a generic message.
  - Anything else: `console.error` with `describeErrorForLog` (PII-free, redacts `keyValue`), and 500 with a generic message.
- Client side: `src/lib/field-errors.ts` `splitApiError` routes `field` to the matching `FormField`, otherwise shows a form-level error.
- Duplicate keys: services call `isDuplicateKeyError` (`src/server/db/mongo-errors.ts`) and throw `ConflictError`.
- `AppErrorKind` `"database"` is declared but never constructed (`grep` finds only the type and the map). Mongo failures
  fall through to `unexpected`.
- Tests: `tests/shared/errors/to-response.test.ts`.

## 6. Known gaps and mismatches

- **G1 (docs).** ARCHITECTURE.md "Directory structure" (lines 41–60) omits `src/lib/` (21 tracked files) and
  `src/proxy.ts`. It also lists `AppShell` under `components/shared/`, which does not exist (no file or export).
  ARCHITECTURE has no "API", "Storage" or "PWA" heading; the closest are "Brand & installable app (ADR-036)" (line 400)
  and "Security hardening (ADR-037)" (line 422). ENGINEERING §38 lists `src/domains/configuration/`, which does not exist.
- **G2 (order).** ENGINEERING §36 says Authenticate → Validate. PATCH `employees/[id]` validates first (route lines 27–28).
  Unauthenticated callers with a bad body get 400, not 401.
- **G3 (atomicity).** PATCH runs `PersonService.update` and then `EmployeeService.update` with no transaction. If the
  second fails with 409 (duplicate employee number), the person change is already committed and audited. ADR-041 covers
  only the groups that must not split and does not name profile edits, so this may be intended. Open question Q1.
- **G4 (route logic).** The PATCH route reads the employee detail and checks the linked person (lines 30–31).
  ENGINEERING §37 says routes should orchestrate only.
- **G5 (inverted imports).** `src/server/db/models/payroll-policy.ts:2` imports `src/domains/payroll/engine/premiums`.
  `src/server/auth/options.ts:4–9` imports `domains/identity/*` and `domains/authorization/super-admin-service`.
  `src/server/audit/audit-query-service.ts:4` imports `domains/identity/user-directory`. `src/shared/validation/asset-issuance.ts:2`
  imports `ASSET_CONDITIONS` from a Mongoose model file, which pulls `mongoose` into anything that imports that validation
  module. Today only API routes and a service import it, so there is no bundle leak yet.
- **G6 (pages).** Five files import models directly (section 3). Not a documented rule breach, but the domain layer is skipped.
- **G7 (shared component).** `components/shared/no-access-state.tsx` is a server component that queries the DB.
- **G8 (stale ARCHITECTURE).** ARCHITECTURE.md line 139 says attendance photos are "stored as base64 in MongoDB". Code:
  `src/server/storage/attendance-photo-storage.ts` puts them in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set.
  ADR-038 does not mention attendance photos; the only record is the file header.
- **G9 (proxy vs ENGINEERING §40).** §40 expects the proxy to handle route protection. Here it does not check sessions at all.
- **G10 (no proxy test).** No file under `tests/` covers `src/proxy.ts`. `csp.test.ts` and `csrf.test.ts` cover its helpers.

## 7. Open questions

- **Q1.** Should profile edits be atomic (G3)? If so, wrap the two writes in `withTransaction` and audit after commit.
- **Q2.** Is direct model access from pages (G6) an accepted pattern? If so, ENGINEERING §39 should say so.
- **Q3.** Should `src/proxy.ts` gain a cheap session-presence check (ENGINEERING §40), or is the layout gate enough?
