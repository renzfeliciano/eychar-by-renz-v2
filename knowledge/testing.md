# Testing and verification (Phase 7)

**Built from commit:** `6587050` (main). **Last verified:** `6587050`.
**Sources of truth:** `docs/ENGINEERING.md` §46 (testing), §58 (domain test), §59 (historical test), §60 (authorization test); `package.json`; `vitest.config.ts`; `playwright.config.ts`; `.github/workflows/ci.yml`; `.husky/pre-commit`.
Code wins over docs. Paths are relative to the repo root.

## 1. Commands

| Command | What it runs | Source |
|---|---|---|
| `npm test` | `npm run test:ui && npm run test:domains && npm run test:core` | `package.json` scripts |
| `npm run test:ui` | `vitest run tests/app` (41 files: components, pages, route handlers under `tests/app/api/`) | `package.json` |
| `npm run test:domains` | `vitest run tests/domains` (99 files, one folder per domain) | `package.json` |
| `npm run test:core` | `vitest run tests/server tests/security tests/lib tests/shared tests/standards` (134 files, see §2) | `package.json` |
| `npm run test:each` | `node scripts/test-each.mjs`: runs each test file in its own Vitest process with a 150 s kill timeout, prints `ok` / `FAIL` / `TIMEOUT`. Default folders are the `test:core` set; pass folders to change them (`-- tests/domains`). | `scripts/test-each.mjs` (lines 11-12) |
| `npm run test:watch` | `vitest` (watch mode) | `package.json` |
| `npx vitest run <path>` | One file or folder | `package.json` |
| `npm run test:e2e` | `playwright test` against a production build on port 4200 | `playwright.config.ts` |
| `npm run typecheck` | `next typegen && tsc --noEmit` | `package.json` |
| `npm run lint` | ESLint 9 | `package.json` |

**Gates.**
- Pre-commit (`.husky/pre-commit`): lint and typecheck only. The file says the full suite runs in CI.
- CI (`.github/workflows/ci.yml`, on push to `main` and every PR): `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Node 22, 25-minute timeout. No e2e step (see §5).

## 2. Test folder map

Counts are `*.test.ts` / `*.test.tsx` files found under each folder.

| Folder | Files | Covers | Environment |
|---|---|---|---|
| `tests/app/` | 41 (incl. `api/` 2) | React components and pages in `src/app` and `src/components` (dialogs, tables, nav, loaders, forms). 39 files opt into jsdom with `// @vitest-environment jsdom`; `tests/app/api/*` runs in node. | jsdom / node |
| `tests/domains/<domain>/` | 99 across 22 folders | Domain services in `src/domains/<domain>/` (see §3). Real MongoDB through the shared in-memory replica set. | node |
| `tests/server/` | 18: `audit` 2, `auth` 4, `authorization` 4, `db` 2, `security` 4, `storage` 1, plus `policy-coverage.test.ts` | `src/server/**`: auth options, session policy, authorization (`authorize.test.ts`, `project-scope.test.ts`), transactions (`db/transaction.test.ts`), rate limit, CSRF, CSP, cron auth. `policy-coverage.test.ts` tests `policyCoverage` (policies in force, organization-wide vs per-project). | node |
| `tests/security/` | 3: `races-2026-10.test.ts`, `route-guards.test.ts`, `scan-2026-10.test.ts` | Concurrency (stale-read tests run anywhere; concurrent ones need the replica set), route guard coverage, a file named for a 2026-10 scan. | node |
| `tests/lib/` | 9 | `src/lib`: CSV (`csv.test.ts`), table export (`table-export.test.ts`), app time, money, relative time, user agent, WebAuthn error text, liveness, MediaPipe console noise. | node |
| `tests/shared/` | 3 (`errors/`, `password-policy.test.ts`, `remarks-validation.test.ts`) | `src/shared`: error types, password policy, remarks validation. | node |
| `tests/standards/` | 2: `button-standard.test.ts`, `mutation-feedback.test.ts` | Source-scanning guards for UI conventions. See `knowledge/ui-patterns.md` §8. | node |
| `tests/e2e/` | 3 specs + helpers (see §5) | Real browser, server and database. Not run by Vitest. | Playwright |

Shared fixtures: `tests/domains/payroll/fixtures.ts` (e.g. `seedPayrollOrganization`) and similar per-folder helpers. No top-level fixtures folder exists (`find tests -name "*fixture*"` finds one file).

### 2.1 Domains with no test file

Each folder in `src/domains/` has a matching `tests/domains/<name>/` folder except one:

- **`audit`**: `src/domains/audit/` exists but has no tracked files (`git ls-files src/domains/audit` is empty; the folder is empty on disk). `tests/domains/audit/` does not exist. Audit logic lives in `src/server/audit/`, covered by `tests/server/audit/` (2 files). Overview Phase 0 open question 3 is still open.

### 2.2 Source files no test imports directly

Heuristic: a domain source file's basename does not appear in any test import path. Indirect coverage through another service is possible, so these are candidates, not confirmed gaps.

- `src/domains/attendance/current-staff.ts`
- `src/domains/catalog/simple-catalog-service.ts`
- `src/domains/events/holiday-category.ts`
- `src/domains/holidays/holiday-types.ts`, `presets/index.ts`, `presets/types.ts`
- `src/domains/identity/user-audit.ts`
- `src/domains/organization/organization-service.ts` (core service, no direct test)
- `src/domains/payroll/adjustment-categories.ts`, `payroll-run-guards.ts`, `payroll-scope.ts`
- `src/domains/people/employee-records.ts` (`people/` has 1 test file for 2 source files)
- `src/domains/workforce/assignments-as-of.ts`

Other thin folders: `tests/domains/people/` (1 file), `tests/domains/recruitment/`, `cases/`, `documents/`, `final-settlement/`, `travel-orders/` (2 each), `assets/` (1).

## 3. Test infrastructure

**`vitest.config.ts`**
- `process.env.TZ = "UTC"` (line 8) so time math that leans on the machine timezone fails in tests, as it would on Vercel (see `src/lib/app-time.ts`).
- `environment: "node"`; `include: ["tests/**/*.test.{ts,tsx}"]` (so `*.spec.ts` in `tests/e2e` is not picked up).
- `setupFiles: ["./tests/setup.ts"]`, `globalSetup: "./tests/global-setup.ts"`.
- `fileParallelism: false`: all files run serially against one database. Parallel workers on one `mongod` gave non-deterministic failures (comment in file).
- `clearMocks: true`; `testTimeout: 15_000`.
- Path aliases through `vite-tsconfig-paths` (`@/` maps to `src/`).

**`tests/global-setup.ts`**
- Starts one `MongoMemoryReplSet` with a single node and `wiredTiger`, sets `process.env.MONGODB_URI`, stops it in `teardown`. Replica set is needed because transactions (`src/server/db/transaction.ts`, ADR-041) only work on one.
- The mongod binary is downloaded on first run. `package.json` sets `mongodbMemoryServer.disablePostinstall: true`. CI caches `~/.cache/mongodb-binaries` (`ci.yml`).

**`tests/setup.ts`**
- Imports `@testing-library/jest-dom/vitest`.
- Sets `process.env.NEXTAUTH_SECRET` to a test value if unset (the MFA secret box also derives from it).
- `afterEach(cleanup)` from Testing Library.
- Does not reset the database. Isolation is per test by data: domain tests create their own organization, project and employees with fixtures (e.g. `tests/domains/payroll/fixtures.ts`) and fresh `ObjectId`s (15 domain files create ids this way). a `beforeEach` often calls `connectMongoDB()`, e.g. (e.g. `tests/domains/payroll/payroll-run-service.test.ts:37`).

## 4. Required test types (ENGINEERING §46, §58-§60) and how existing tests measure up

### 4.1 Test levels (§46)

| Level | Existing tests | Status |
|---|---|---|
| Unit | `tests/lib/*`, `tests/shared/*` | Present |
| Domain | `tests/domains/*` (99 files) | Present |
| Integration (real DB) | `tests/server/db/transaction.test.ts`, `tests/security/races-2026-10.test.ts` | Present; concurrency tests need the replica set |
| API (route handlers) | `tests/app/api/route-handlers.test.ts` (6 tests), `tests/app/api/employment-and-evaluation-routes.test.ts` (5), `tests/security/route-guards.test.ts` | Present but thin for 43 route folders |
| Authorization | `tests/server/authorization/project-scope.test.ts`, `authorize.test.ts`, `tests/domains/authorization/role-grant-security.test.ts` | Present |
| End-to-end | `tests/e2e/*.spec.ts` (3 specs) | Present, not in CI (§5) |

### 4.2 Required scenarios

**§58 Domain scenario** (1 Organization, 1 HR, 5 Projects, 20 Employees, growing to 5 HR, 50 Projects, 2,000 Employees): **not found.** The only large fixture is 50 people in `tests/domains/payroll/compensation-service.test.ts:138`, which is one payroll case, not the §58 scenario. Growth-path tests are an open item.

**§59 Historical scenario** (2025 Supervisor / Project A / Manager B, then 2026 Operations Manager / Project B / Manager C): **partly covered.** `tests/domains/workforce/employee-assignment-service.test.ts:45` ("required historical test (ENGINEERING.md §59)") checks that the 2025 assignment is kept, the 2026 one is created, and identity is the same. Not verified in that file: reconstructing the historical org chart, audit history, and the policy-by-date rules.

**§60 Authorization matrix** (A org-wide; B on Project A; C on Project B): **covered.** `tests/server/authorization/project-scope.test.ts:74` ("required test §60") checks the matrix at the server layer. It also tests the route guard (line 87), expired assignment (line 134), removed permission (line 141), and project scope limits on routes (lines 234-262). This matches ENGINEERING §60 ("test the server-side authorization directly").

**§46 authorization list:**

| Case | Where | Status |
|---|---|---|
| Organization-wide vs project-only | `project-scope.test.ts:74` | Covered |
| Unauthorized project access | `project-scope.test.ts:117`, `:253` | Covered |
| Expired role assignment | `project-scope.test.ts:134` | Covered |
| Removed permission | `project-scope.test.ts:141` | Covered |
| Employee transfer | `employee-assignment-service.test.ts` (§59 test) | Covered |
| Manager change | `employee-assignment-service.test.ts` mentions manager | Not confirmed as a dedicated case |
| Historical assignment | §59 test above | Covered |
| Historical policy vs current policy | `tests/domains/payroll/payroll-rule-version-service.test.ts:90` (a version whose effective window does not cover the date is not picked) | Partial |
| Payroll reproducibility (rerun a released run after a policy change gives the same result) | no test found (`grep -rniE "reproduc"` under `tests/` is empty) | **Not covered** |

### 4.3 Deliverables (§61)
Not checked in this pass.

## 5. End-to-end (Playwright)

**Specs** (`tests/e2e/`):
- `sign-in.spec.ts` (3 tests): HR signs in and reaches the dashboard; wrong password refused; signed-out visitor sent to sign-in.
- `idle-sign-out.spec.ts` (2 tests): idle session warns then signs out with a notice; choosing "stay signed in" keeps the session.
- `payroll-run.spec.ts` (1 test, 63 lines): HR prepares a payroll run for a far-future period, submits it, a second account approves it. Needs a policy and rule version in the E2E database, and an approver account (`E2E_APPROVER_USERNAME` / `E2E_APPROVER_PASSWORD`); without the approver the approval step is skipped (`tests/e2e/README.md`).

**Helpers and setup:**
- `tests/e2e/helpers.ts`: `signIn`, `signInAsHR` (line 16), `acknowledgeReplacedSession` (line 27). Each test signs in itself, because an account has one active session and a new sign-in ends the previous one.
- `tests/e2e/global-setup.ts`: `assertSafeE2EDatabase(uri)` refuses a non-local database whose name lacks `e2e` or `test`. It also requires `E2E_USERNAME` and `E2E_PASSWORD`. Seed script `scripts/seed-e2e.ts` applies the same check (per README).
- `tests/e2e/auth.setup.ts`: signs in once and writes `tests/e2e/.auth/hr.json`. **Not wired in:** `playwright.config.ts` has no `dependencies` on a setup project, and `testMatch` is `**/*.spec.ts`, which excludes it. Dead code unless wired. `tests/e2e/.auth/` is git-ignored (`.gitignore`).
- `tests/e2e/README.md`: local run steps (replica set, `E2E_MONGODB_URI`, seed, `npm run test:e2e`).

**`playwright.config.ts`:**
- `testDir: tests/e2e`, `testMatch: **/*.spec.ts`, `fullyParallel: false`, `workers: 1`, Chromium only (Desktop Chrome).
- `webServer`: `npm run build && npx next start -p ${E2E_PORT ?? 4200}`, timeout 300 s, `reuseExistingServer` only when `E2E_REUSE_SERVER=1`. Env sets `MONGODB_URI` from `E2E_MONGODB_URI` and `NEXTAUTH_URL` to the test port, so the app uses the E2E database.
- Reporter: `github` plus HTML when `CI` is set, else `list`. Traces and screenshots are kept on failure.
- `.gitignore` covers `/test-results/`, `/playwright-report/`, `/tests/e2e/.auth/`.

**CI:** `.github/workflows/ci.yml` has **no e2e job and no Playwright install**. Its only steps are checkout, setup-node, cache, `npm ci`, lint, typecheck, test, build. The statement that CI runs e2e is in `tests/e2e/README.md` ("In CI": an `e2e` job after `check`, MongoDB 7 replica set, `scripts/seed-e2e.ts`, `playwright-report` artifact for 7 days). The root `README.md` (line 37) only gives the local command. `knowledge/overview.md` attributes the CI claim to the README; the source is `tests/e2e/README.md`.

## 6. Known gaps and mismatches

1. **e2e is documented as a CI job but is not one.** `tests/e2e/README.md` ("In CI") vs `.github/workflows/ci.yml` (no e2e job). Open question for the owner.
2. **`auth.setup.ts` is not wired** into `playwright.config.ts` (see §5). It is dead.
3. **`tests/domains/audit/` does not exist** and `src/domains/audit/` is empty. Audit tests are in `tests/server/audit/` (2 files).
4. **§58 scale scenario has no test** (§4.2).
5. **§46 payroll reproducibility has no test** (§4.2).
6. **§46 manager-change and historical-policy cases are not dedicated tests** (§4.2).
7. **§61 deliverables** not checked in this pass.
8. **Thin route-handler tests.** 43 `src/app/api/` route folders (overview) vs 2 files under `tests/app/api/` plus `tests/security/route-guards.test.ts`. Per-route API tests are not visible here.
9. **Domain source files not imported by any test** (§2.2, 13 files, heuristic).
10. **Count mismatch:** `knowledge/overview.md` lists `tests/domains` as 100 files; `find` counts 99 `*.test.ts(x)` files. Overview figure should be corrected in Phase 8.
11. **Per-file `test:each` default covers only `test:core` folders**, not `tests/app` or `tests/domains` (`scripts/test-each.mjs` line 12). Use the folder argument for the others.
12. **Pre-commit runs no tests** (`.husky/pre-commit`); tests are only enforced in CI.
13. **Concurrency tests need transactions.** `tests/security/races-2026-10.test.ts` splits stale-read tests (run anywhere) from concurrent ones (need transactions). `tests/global-setup.ts` always starts the in-memory replica set, so both run in `npm test`.
14. **In-memory MongoDB downloads a binary on first run.** Offline runs fail until it is cached (`package.json` `mongodbMemoryServer`).
15. **UI test environment is per file.** The global environment is `node` (`vitest.config.ts`). A `tests/app` UI test without `// @vitest-environment jsdom` has no DOM. 39 of 41 `tests/app` files have the annotation; the two without are API tests.
