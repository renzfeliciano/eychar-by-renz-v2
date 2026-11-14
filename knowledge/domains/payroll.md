# Payroll: overview, runs, compensation, schedules

**Purpose:** Prepare, review, approve, release and record payroll runs per organization or project, from effective-dated pay terms, attendance and HR adjustments. The calculation rules and rule data are in `payroll-engine.md`.
**Governing docs:** ADR-029 (current design, supersedes ADR-014's lifecycle and model), ADR-014 (engine and run atomicity, partly superseded), ADR-041 (transactions for multi-document writes), ADR-011 (policy resolution), ARCHITECTURE.md § Payroll (line ~194; its paragraphs after "The paragraphs below describe the original Phase 7 design" are superseded by ADR-029), ENGINEERING.md § 28 (Payroll), § 27 (Effective dating), § 26 (Policy resolution), § 33 (Transactions).
**Services:**
- `src/domains/payroll/payroll-run-service.ts`: `PayrollRunService`: `prepare(input, actor, {source})`, `act(runId, input, actor)` (actions: recompute, submit, approve, return, release, cancel), `addAdjustment`, `removeAdjustment`, `list`, `getDetail`.
- `src/domains/payroll/payroll-run-compute.ts`: `computeRun(runId)` (gathers inputs, computes every record in memory, replaces records and totals in one transaction); `withSharedRoster(work)` (batches roster loads for scheduled prepares).
- `src/domains/payroll/payroll-run-guards.ts`: `findRun`, `nextRunNumber` (`PR-YYYY-NNNN`), `assertNoOverlap`, `withComputeLock` (120 s lock on drafts only), `NO_ACTIVE_LOCK`.
- `src/domains/payroll/payroll-schedule-service.ts`: `PayrollScheduleService`: `create`, `update`, `list`, `prepareDueBatch` (max 3 per pass), `prepareDue`.
- `src/domains/payroll/compensation-service.ts`: `CompensationService`: `create`, `revise`, `getAsOf`, `getAsOfForEmployees`, `listForOrganization`, `listHistory`, `previewBulkChange`, `applyBulkChange`.
- `src/domains/payroll/payroll-policy-service.ts`: `PayrollPolicyService`: `create`, `updateStatus`, `listCurrent`, `resolve`.
- `src/domains/payroll/payroll-rule-version-service.ts`: `PayrollRuleVersionService`: `create` (auto-numbered), `updateStatus`, `listCurrent`, `getById`, `resolve`.
- `src/domains/payroll/payroll-attendance.ts`: `summarizeAttendance()`, the attendance-to-pay reader.
- `src/domains/payroll/payroll-scope.ts`: `projectsAsOf()`, each employee's project on a day.
- `src/domains/payroll/payroll-register-export.ts`: Excel and CSV register builders (`roundMoney`, `sumMoney`).
- `src/domains/payroll/adjustment-categories.ts`: suggested `PayrollAdjustment` categories with default direction and taxable flag (suggestions only; any code is accepted).
- Engine and tax: see `payroll-engine.md`.

**Models** (`src/server/db/models/`, all exported from `index.ts`):
- `payroll-run.ts` `PayrollRunModel`: `runNumber` (unique per org), `payPeriodStart/End`, `payDate`, `policyId`, `ruleVersionId` (snapshots), `projectId?`, `status` (`PAYROLL_RUN_STATUSES`, default `draft`), `source` (manual or schedule), per-step user ids, `computeLock`/`computeLockUntil`, `history[]`, `totals`, `exclusions[]`, `blockingIssues`, `warningCount`.
- `payroll-record.ts` `PayrollRecordModel`: one per run and employee (unique `{payrollRunId, employeeId}`); stores inputs (`rate`, `monthlyBasic`, `dailyRate`, `hourlyRate`, `attendance`), lines (`earnings`, `contributions`, `deductions`), totals, `warnings`, `previousNetPay`, name and number snapshots.
- `payroll-adjustment.ts` `PayrollAdjustmentModel`: HR inputs per run and employee (`category`, `label`, `direction`, `amount`, `taxable`).
- `payroll-policy.ts` `PayrollPolicyModel`: `payFrequency`, `workDaysPerYear` (default 261), `hoursPerDay` (8), `workWeekDays`, `deductLateAndUndertime`, `contributionTiming`, premium multipliers, `finalPayDeadlineDays`, `effectiveFrom` (default now), `status`, optional `projectId`.
- `payroll-rule-version.ts` `PayrollRuleVersionModel`: `versionNumber` (unique per org), `taxTables`, `contributions`, `basedOnVersionId`, `status` (default `active`), `effectiveFrom` (default now), optional `projectId`.
- `compensation.ts` `CompensationModel`: effective-dated pay terms per employee (`rateType`, `rate`, `allowances[]`, `minimumWageEarner`, `effectiveFrom`, `effectiveTo`, `batchId`). Indexes include `{employeeId, effectiveFrom}`, but there is no unique constraint.
- `payroll-schedule.ts` `PayrollScheduleModel`: `payFrequency`, `cutoffDay`, `payDateOffsetDays`, `autoPrepare`, `status`, `startsOn`, `lastPreparedPeriodEnd`, `lastRunId`, `lastError`, `lastAttemptAt`, optional `projectId`. Not listed in ARCHITECTURE.md's model list.
- Related, owned elsewhere: `src/server/db/models/final-settlement.ts` (domain: `src/domains/final-settlement/`) reuses `payPremiumsOf` and `roundMoney`.

**Routes** (`src/app/api/`; every handler calls `requirePermission(...)` first):
- `payroll-runs/route.ts`: GET (`payroll-runs.read`), POST = prepare (`payroll-runs.create`).
- `payroll-runs/[id]/route.ts`: GET detail (`payroll-runs.read`); PATCH `{action}` with the permission per action from `PERMISSION_BY_ACTION`: recompute, submit, cancel → `payroll-runs.update`; approve, return → `payroll.approve`; release → `payroll.release`. `recompute` and `submit` also call `enforceRateLimit("payrollCompute")`.
- `payroll-runs/[id]/adjustments/route.ts` (POST) and `[adjustmentId]/route.ts` (DELETE): `payroll-runs.update`.
- `payroll-runs/[id]/export/route.ts` (GET, `payroll-runs.read`, `auditExport`).
- `payroll-policies/` and `payroll-rule-versions/` (GET/POST; `[id]` PATCH with `.update`).
- `payroll-schedules/route.ts` (GET/POST), `[id]/route.ts` (PATCH), `prepare/route.ts` (POST, `payroll-runs.create`, calls `prepareDue`).
- `compensation/route.ts` (GET, POST), `[employeeId]/route.ts` (PATCH, `compensation.update`), `bulk/route.ts` (POST: `compensation.read` for preview, `compensation.update` for apply).
- `src/app/api/cron/payroll-schedules/route.ts` (GET): `checkCronAuthorization`; 503 when `CRON_SECRET` is unset; calls `prepareDueBatch()` for all organizations.
- Permission key strings are defined outside the payroll folder (Phase 4 territory; `src/server/authorization/`).

**Pages** (`src/app/(app)/payroll/`):
- `page.tsx` (list; also calls `PayrollScheduleService.prepareDue` in `after()` when the user can create runs), `new-run-dialog.tsx`, `payroll-status-badge.tsx`, `loading.tsx`.
- `[id]/page.tsx` (run detail, exclusions panel), `[id]/run-actions.tsx`, `[id]/run-register.tsx` (adjustment form), `[id]/payslips/page.tsx` and `print-button.tsx`, `[id]/run-types.ts`.
- `policies/page.tsx` and `create-payroll-policy-dialog.tsx`.
- `rule-versions/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `rule-version-editor.tsx`.
- `compensation/page.tsx`, `compensation-form-dialog.tsx`, `bulk-change-dialog.tsx`.
- `schedules/page.tsx`, `schedule-dialog.tsx`, `prepare-now-button.tsx`.
- Also linked from `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/people/[id]/page.tsx`, `src/components/shared/nav-links.tsx`.

**Tests:**
- `tests/domains/payroll/payroll-run-service.test.ts` (10 cases: prepare scope, double-pay guard, lifecycle, adjustments lock, blocking issues, released run immutability, net-pay warning).
- `tests/domains/payroll/compensation-service.test.ts`, `payroll-schedule-service.test.ts`, `payroll-rule-version-service.test.ts`, `payroll-attendance.test.ts`, `payroll-register-export.test.ts`, `cross-organization-integrity.test.ts`, `pay-premiums.test.ts`, `ph-statutory-template.test.ts`, `payroll-engine.test.ts`, `payroll-tax.test.ts` (engine files: see `payroll-engine.md`), fixtures in `tests/domains/payroll/fixtures.ts`.
- No UI test for the payroll pages under `tests/app/` (only `settlement-actions.test.tsx` matches a search for "settlement", and it was not checked for payroll content).
- `tests/e2e/payroll-run.spec.ts` (Playwright, 1 test).
- `tests/lib/money.test.ts` (rounding, shared with the engine).

**Rules a change must respect:**
- **Compute, then write.** `computeRun` gathers everything, computes in memory, then deletes and inserts records and saves totals in one `withTransaction` (`src/domains/payroll/payroll-run-compute.ts`, end of `computeRun`; ADR-041). Keep the write group small and pass `{ session }` to every write.
- **Only drafts are recomputed or changed.** Recompute, adjustment changes and submit all run inside `withComputeLock`, which only takes a lock on `status: "draft"` (`payroll-run-guards.ts`). Released and approved runs are never rewritten (`payroll-run-compute.ts` relies on this).
- **Recompute uses the run's snapshot.** `computeRun` loads `run.policyId` and `run.ruleVersionId`, never the currently active policy or version (`payroll-run-compute.ts`, top of `computeRun`). A new rule version reaches a run only if the run is prepared again.
- **Double-pay guard.** `assertNoOverlap` (`payroll-run-guards.ts`): an organization-wide run conflicts with any non-cancelled run over overlapping dates; a project run conflicts with organization-wide runs and runs for the same project. Released runs always block, because `cancel` is only allowed from `draft` or `submitted` (`TRANSITIONS` in `payroll-run-service.ts`).
- **Prepare checks the second time.** `prepare` creates the draft, runs `assertNoOverlap` again excluding later-created runs, then computes. Any failure deletes the run and its records (`payroll-run-service.ts`, `prepare`).
- **Transition table is the only state machine.** `TRANSITIONS` in `payroll-run-service.ts`: submit (draft→submitted), approve (submitted→approved), return (submitted or approved→draft, reason required), release (approved→released, `releasedOn` and optional `paymentReference`), cancel (draft or submitted→cancelled, reason required). `act` applies each transition with a conditional `findOneAndUpdate` that matches the status read earlier, and returns 409 on a lost race.
- **Submit recomputes under the lock first.** It refuses an empty run ("There's no one to pay") and any `blockingIssues > 0` (`payroll-run-service.ts`, `act`, `submit` branch).
- **Self-approval is allowed and recorded**, not blocked: `metadata.selfApproved` in the audit entry (`payroll-run-service.ts`, `approve` branch; ADR-029 Decision).
- **Nothing is deleted.** Runs are cancelled, not removed. Adjustments are deleted only in draft, and each removal is audited with its prior values (`removeAdjustment`).
- **Every state change is audited and in `history`.** Each transition pushes a `history` entry and calls `AuditService.record` (`payroll-run-service.ts`).
- **Pay terms are a dated row per employee.** `CompensationService.revise` (`compensation-service.ts`) closes the latest row the day before and creates a new one; it never edits a past row. Bulk apply (`applyBulkChange`) does the same for many employees in one transaction with a shared `batchId`.
- **Policy and rule version are resolved on purpose.** Policy by pay period end, rule version by pay date (`PayrollRunService.prepare`). Pay terms by period end (`computeRun`, `getAsOfForEmployees(end)`). Detail in `payroll-engine.md`.
- **Permission per action.** Keep `PERMISSION_BY_ACTION` (`src/app/api/payroll-runs/[id]/route.ts`) and the service `TRANSITIONS` in step when adding an action.
- **Schedules only prepare drafts.** `prepareDueBatch` never submits, approves or releases (`payroll-schedule-service.ts`; ADR-029). It is idempotent: a non-cancelled run with the same org, project and period counts as done (`existingRuns` check).
- **Schedule cap.** At most `PREPARE_LIMIT_PER_PASS` (3) prepares per pass; the rest are "deferred" (`payroll-schedule-service.ts`). Failures are stored on the schedule (`lastError`), not thrown.
- **Cron is off without a secret.** `src/server/security/cron-auth.ts` returns "unconfigured" when `CRON_SECRET` is missing, and the route answers 503.
- **Project scope is partial.** List (`payroll-runs/route.ts`) and detail GET (`payroll-runs/[id]/route.ts`) use `requireAccessibleProjects`, so a project-scoped holder sees only their projects' runs. PATCH actions, adjustments and export use organization-wide `requirePermission`, so a project-scoped holder is refused there (ARCHITECTURE.md § Known gaps; ADR-043). Project runs select employees by project as of the period end (`projectsAsOf`, `payroll-scope.ts`).
- **Compensation rows are inclusive dates.** A row applies from `effectiveFrom` through `effectiveTo`, both included (`compensation.ts` model comment; `appliesOn` in `compensation-service.ts`).

**Known gaps / mismatches:**
- **`Compensation.revise` is not transactional.** It saves the closed row, then creates the new one (`compensation-service.ts`, `revise`). A failure between the two leaves the employee with no open row, so the next prepare excludes them (`computeRun` "No pay terms"). ADR-041 says multi-document writes use transactions; `applyBulkChange` does, `revise` does not.
- **Exclusions are silent in the gate.** Employees with no pay terms on the period end are listed in `run.exclusions` and the run can still be submitted (`computeRun`; `payroll/[id]/page.tsx` shows the list). ADR-014 Decision 3 said the whole call throws; ADR-029 replaced that with exclusions. ADR-014's Consequences names `tests/domains/payroll/payroll-service.test.ts`, which does not exist. The current test is `payroll-run-service.test.ts`.
- **ADR-029 vs code on permissions.** ADR-029 says prepare, edit, submit and cancel use `payroll-runs.update`. Code: prepare uses `payroll-runs.create` (`src/app/api/payroll-runs/route.ts`); submit, cancel and recompute use `payroll-runs.update`.
- **ADR-029's status note vs ADR-041.** ADR-029 says ADR-014's reasons for avoiding transactions "still apply". ADR-041 supersedes them for the write step, and the code uses `withTransaction`. Treat the code and ADR-041 as current.
- **ARCHITECTURE.md is partly stale.** It says `PayrollService.generateRun()` and "`Compensation` (base salary + allowance per pay period)". The code has `PayrollRunService.prepare` and `CompensationService`. The stale paragraphs are marked as superseded in ARCHITECTURE.md itself, but the names still mislead.
- **ARCHITECTURE.md model list omits `PayrollSchedule`** (`src/server/db/models/payroll-schedule.ts`).
- **Overlapping rule versions or policies are not blocked.** `create` in both services has no overlap check (`payroll-rule-version-service.ts`, `payroll-policy-service.ts`). Resolution picks the newest `effectiveFrom` among active rows (`resolveOrgProjectPolicy`).
- **A corrected rule version does not reach existing drafts.** Only a fresh prepare picks it up (see the snapshot rule above). No UI signal says so.
- **Adjustment writes are not atomic with the recompute.** `addAdjustment` and `removeAdjustment` create or delete the row, then call `computeRun` (`payroll-run-service.ts`). If the recompute throws, the change stays and the call returns an error. The next recompute picks it up.
- **Concurrency tests need a replica set.** ARCHITECTURE.md § Known gaps notes that concurrency tests need a real replica set; payroll's transactional paths depend on it.

**Last verified:** 6587050.
