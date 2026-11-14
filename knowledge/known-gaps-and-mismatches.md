# Known gaps and mismatches (Phase 8)

**Built from commit:** `6587050`. **Verified:** 2026-11-14.

Status key:
- **Verified**: I opened the cited code or doc and confirmed the claim.
- **Reported**: a domain or layer agent found it. I have not re-checked it. Check before acting on it.
- **Decision needed**: the repo cannot settle it; a person has to choose.

Each entry cites the file that shows the problem. "Doc" means the ARCHITECTURE.md, ENGINEERING.md, or ADR claim; "code" means the implementation.

## Resolved and decided, 2026-11-14

Decisions from the project owner, applied in this pass. Rows below still describe the state when the
gap was found. This section is the current position.

| Item | Decision | What changed |
|---|---|---|
| A1 Idle timeout and session cap | **30 min idle, 8 h cap** (ADR-030) | `SESSION_IDLE_MS` 30 min; `DEFAULT_SESSION_MAX_HOURS` 8. Tests updated. Security form copy now generated from the constants (it had said "sign-out at 60"). The e2e seed still pins 1 minute on purpose. |
| A4 Employee documents deletable | **Keep deletable, through the recycle bin** | ADR-025 amended. Recycle bin is Super Administrator only and purges after 30 days. |
| B1 Final settlement status | **Accepted, partly implemented** | ADR-032 status changed. Missing controls stay open here (B1 row below). |
| B6 Pay-rate timing within a period | **Address Philippine payroll standards.** Full proration is the target. | Compliance review in `philippine-payroll-compliance.md` §4–5. Not yet implemented: needs an agreed proration method. The existing warning stays in place. |
| B15, B16 Termination and hidden employees | **Read as intended**: termination doesn't close the open assignment; hidden employees stay in payroll, attendance and leave. | Reading taken from "both" in the decision reply. Confirm if you meant "both should change". |
| Tax tables (B6 / §3 of compliance file) | **Address Philippine tax rules** | Withholding brackets corrected to exact values. Remaining tax gaps listed in `philippine-payroll-compliance.md` §3. |

Still open (not answered): decision list items 7–10 (e2e in CI, exports audited, `CHANGE_PROTOCOL.md`,
duplicate seed permissions).

## A. Security and data protection

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | **Idle timeout default is 60 seconds.** ADR-030 says 30 minutes idle and 8-hour sessions. The code default for an org with no saved setting is `SESSION_IDLE_MS = 60_000`. The 30-minute value is only a fallback in `inactivity.ts`, and the session cap there is 12 hours (ADR-010 says the JWT `maxAge` is 8 hours). | Verified | `src/lib/session-idle.ts:7`, `src/domains/identity/security-settings-service.ts:13`, `src/server/auth/inactivity.ts:1,8`, `docs/architecture/adr/ADR-030-sign-in-security.md:13` |
| A2 | **`GET /api/employees` returns the whole roster**, unpaged, with no audit record. The reported fields include statutory IDs, birth dates and remarks. ARCHITECTURE.md says this data is only served via the audited export. | Verified (route has no pagination and no audit call); fields reported | `src/app/api/employees/route.ts:12-20` |
| A3 | **Audit before/after snapshots for `person.updated` store personal data** (TIN, SSS, birth date, address). | Reported | layers / cross-cutting agent |
| A4 | **Employee documents are deletable via the recycle bin.** ADR-025 says "no delete at all". | Verified | `src/domains/deletion/deletion-registry.ts:248`, `docs/architecture/adr/ADR-025-employee-documents.md:29` |
| A5 | **`PATCH /api/employees/[id]/documents/[documentId]` ignores `[id]`** and does not check the document belongs to the employee. | Reported | documents agent |
| A6 | **Viewer-hidden access** (`viewerMaySeeHidden`) grants hidden-record access to any account that has an `employeeId`, not just self-service. | Reported | people agent. **Decision needed:** intended? |

## B. Behavior that contradicts the docs

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | **Final settlement is "Proposed, not yet implemented"** (ADR-032), but the code runs. Disbursement creates no payroll run, no tamper hash, and no variance check. The final-pay deadline is read from two unreconciled sources (`PayrollPolicy` and `Organization.compliance.finalPayDays`). | Verified (status line); rest reported | `docs/architecture/adr/ADR-032-final-settlement.md:5` |
| B2 | **Malformed JSON in a route handler returns 500, not 400.** `toErrorResponse` handles `AppError`, `ZodError` and cast errors, but not `SyntaxError` from `request.json()`. | Verified (by reading the error mapper) | `src/shared/errors/to-response.ts:111-133` |
| B3 | **Attendance "today" is the UTC date.** `toCalendarDateUtc` takes UTC calendar components, while the company works in Manila time (UTC+8). Clock-ins from 00:00 to 08:00 Manila are filed under the previous day. Dashboard and clock use Manila (`localDateKey`), so the two disagree. | Verified (code); impact not reproduced by a test | `src/domains/attendance/attendance-service.ts:39-41`, `self-service-attendance-service.ts:110,160,212`, `src/lib/date-key.ts:21` |
| B4 | **Audit date filters depend on the server timezone.** `new Date("YYYY-MM-DDT00:00:00")` has no zone, so it is read as server-local time. | Verified (code) | `src/domains/audit/audit-query-service.ts:49-50`. Note: the file lives under `src/server/audit/`, not `src/domains/audit/` (the folder there is empty). |
| B5 | **Overtime and rest-day multipliers are never applied by the payroll engine.** Overtime, holiday and night differential are HR-entered adjustments. The engine only adds a warning. | Verified (grep) | `src/domains/payroll/engine/compute-pay.ts:174-177` |
| B6 | **Payroll rules resolve by period end or pay date**, not by each day. This may conflict with ENGINEERING.md §27 (effective dating). | Reported | payroll agent. **Decision needed:** is the mid-period pay-rate rule intended? |
| B7 | **Payroll run atomicity:** ADR-014 says the no-transaction rule and a throw on missing pay terms. The code uses transactions (ADR-041) and silently excludes the employee. `Compensation.revise()` is not transactional. | Reported (ADR-014 throw wording verified at lines 66–69) | `docs/architecture/adr/ADR-014-payroll-rules-engine.md`, `payroll-run-service.ts` |
| B7a | **Resolved 2026-11-14 (payroll plan Phase 1).** `CompensationService.revise` closes and opens pay terms in one transaction (1a). `addAdjustment`/`removeAdjustment` undo the adjustment if the recompute fails (1b). A run with excluded employees needs a reason for each at submit, stored on the run (`exclusionAcknowledgements`), in its history note and in the audit entry; not a hard block (1c). A second active policy or rule version for the same scope and the same `effectiveFrom` day is refused (1d). A draft shows a notice when a newer policy or rule version now applies; the snapshot rule is unchanged (1e). ADR-014's "throw on missing pay terms" wording is still out of step with the code (exclusion + acknowledgement), and is left to the ADR work in Phase 8. | Verified (tests) | `compensation-service.ts`, `payroll-run-service.ts`, `same-day-version-guard.ts`, `tests/domains/payroll/` |
| B22 | **ADR-029 and ARCHITECTURE.md vs code on payroll:** ADR-029 said prepare uses `payroll-runs.update`; the code uses `payroll-runs.create` (`src/app/api/payroll-runs/route.ts`). ARCHITECTURE.md named a `PayrollService.generateRun()` that no longer exists. **Resolved 2026-11-14:** both docs now match the code. | Verified | `ADR-029-payroll-rebuild.md`, `ARCHITECTURE.md` |
| B23 | **13th month above ₱90,000 can go untaxed** (payroll plan Phase 3, owner decision 2026-11-14 to defer the cap). The 13th-month run pays its line as non-taxable, as the `thirteenth_month` adjustment always did; nothing tracks the yearly ₱90,000 exemption, and the Phase 4 year-end true-up only sees what was flagged taxable, so it won't catch the excess. HR must mark any excess taxable by hand until the cap is built. | Known risk (deferred) | `thirteenth-month-compute.ts`, `adjustment-categories.ts` |
| B24 | **13th-month base and DOLE report not checked against official texts.** The base (basic, absences and tardiness lines; overtime, premiums and allowances out) follows the plan's reading of PD 851; the DOLE report export's fields and the January 15 due date are from secondary sources. Gate B approved building on them; HR or counsel should confirm. | Open (legal check) | `engine/thirteenth-month.ts`, `thirteenth-month-report.ts`, `knowledge/plans/payroll-phase-3-13th-month.md` |
| B8 | **Recycle bin is a move, not a soft delete.** Records go to `DeletedRecord` and leave the live collection. ADR-033 describes exactly this design, so this is **not** a contradiction. Noted here so nobody reads "soft delete" as a flag. | Verified | `src/domains/deletion/deletion-service.ts:86,145`, `docs/architecture/adr/ADR-033-safe-delete-recycle-bin.md` |
| B9 | **Idle-timeout and warning values:** see A1. | Verified | — |
| B10 | **Catalog metadata flags are write-once.** `isClosed`, `isHired`, `isActiveHeadcount` and `regularizeAfterMonths` can be set on create, but no PATCH path updates them. ARCHITECTURE.md's "Known gaps" line understates this. | Reported | catalog agent |
| B11 | **Project scope is partial.** Only `GET /api/attendance` honours it. The attendance page and all attendance writes are organization-wide. | Reported | attendance / authorization agents |
| B12 | **Hire is not atomic.** `HireService.hire` writes `Person` and `Employee` before checking `employmentType`, so a bad type or duplicate `employeeNumber` leaves orphan rows. The test only checks the rejection. | Reported | workforce agent |
| B13 | **Staff account create orphans a `Person` on a duplicate username.** | Reported | identity agent |
| B14 | **`PATCH /api/employees/[id]` runs two writes with no transaction**, and validates before authenticating (ENGINEERING §36 says the reverse). | Reported | layers agent |
| B15 | **Termination does not close the open `EmployeeAssignment`.** | Reported | people agent. **Decision needed:** intended? |
| B16 | **Hidden employees still appear in payroll, attendance and leave**, because those models have no hidden plugin. | Reported | people agent. **Decision needed:** intended? |
| B17 | **Legacy `PerformanceReview` routes are live, and submit has no reviewer check.** `EvaluatorRule` has no editor. | Reported | performance agent |
| B18 | **`LeaveRequestService.cancel` is not a conditional update**, despite ARCHITECTURE.md's ADR-040 claim. | Reported | identity/leave agent |
| B19 | **Employment `status` is a free string**, not the documented enum. | Reported | data-model agent |
| B20 | **Collection names and fields:** ARCHITECTURE.md uses camelCase collection names and `reportsToEmployeeId`, which the schema no longer has. `users.employeeId` and `personId` are queried but unindexed. | Reported | data-model agent |
| B21 | **Model count:** 63 models in `src/server/db/models/`, not 65. The 65 files include `index.ts` and `simple-catalog-schema.ts`. Corrected in `overview.md` and `layers.md`. | Verified | `ls src/server/db/models` (excluding the two files) |

## C. Missing or incomplete

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | **ADR-034 and ADR-051 are cited in code but missing** from `docs/architecture/adr/`. ADR-008, ADR-021 and ADR-034 also have numbering gaps. | Verified (ADR-034 missing) | `ls docs/architecture/adr`; code citations via grep |
| C2 | **e2e tests are documented as a CI job, but CI doesn't run them.** `tests/e2e/README.md:8` says an `e2e` job in `.github/workflows/ci.yml` runs them. The workflow has no e2e job and no Playwright step. The top-level README only gives the local command. | Verified | `.github/workflows/ci.yml` (no match for e2e/playwright); `tests/e2e/README.md:6-10` |
| C3 | **`src/domains/audit/` is an empty directory on disk**, not untracked files. Audit behavior is in `src/server/audit/`. | Verified (per the layers agent) | `src/domains/audit/` |
| C4 | **`design-system/workforcehub/pages/` is an empty directory.** No doc explains it. | Verified | `design-system/workforcehub/pages/` |
| C5 | **UI rules have no tests.** No test checks `loading.tsx` per route, `dvh` or `min-h-10`, or `PageHeader` use. Two pages skip `PageHeader` (`people/[id]`, payslips). The standards guards only match literal double-quoted strings. | Reported | ui/testing agent |
| C6 | **No test for the §58 scale scenario or §46 payroll reproducibility.** The §60 authorization matrix is covered (`tests/server/authorization/project-scope.test.ts:74`). | Reported | ui/testing agent |
| C7 | **Concurrency tests need a real replica set.** Some race tests only run in CI or the in-memory replica set. | Doc (ARCHITECTURE.md "Known gaps") | `tests/security/races-2026-10.test.ts` |
| C8 | **Exports are not audited**, and clearance `GET` writes (`syncAutomaticItems`). The clearance page reads `AuditLog` directly. | Reported | cross-cutting / clearance agents. **Decision needed:** intended? |
| C9 | **Transfer does not check `effectiveFrom`** against the current assignment's start. | Reported | people agent |
| C10 | **`BASELINE_PERMISSIONS` has duplicate entries in `scripts/seed.ts`.** Not tested on a fresh database. | Reported | authorization agent |
| C11 | **`CHANGE_PROTOCOL.md`** appeared in `knowledge/` at 12:17 on 2026-11-14. It was not written by this exploration's agents. Its author is unknown. | Verified (file exists, untracked) | `knowledge/CHANGE_PROTOCOL.md` |

## D. Decisions needed from people

1. **Session length and idle timeout** (A1): 30 min and 8 h (ADR-030), or the current 60 s and 12 h?
2. **Deleting employee documents** (A4): keep deletable, or enforce ADR-025's "no delete"?
3. **ADR-032 status** (B1): accept the design, or hold the code until it is implemented?
4. **Mid-period pay rate rule** (B6): is period-end resolution intended?
5. **Philippine tax and contribution tables** in the seed data: current against official schedules? Not verified here.
6. **Hidden employees in payroll, attendance and leave** (B16) and **termination not closing assignments** (B15).
7. **E2E in CI** (C2): add the job, or correct the README?
8. **Exports and audit** (C8): should exports be audited?
9. **`CHANGE_PROTOCOL.md`** (C11): keep it, and who owns it?
10. **Duplicate permissions in seed** (C10): test on a fresh database?
