# Payroll: runs, compensation, schedules, and the calculation engine

**Purpose:** Prepare, review, approve, release and record payroll runs per organization or project, from effective-dated pay terms, attendance and HR adjustments (Part 1); and the pure calculation of one employee's payslip, the rule data it reads, and the rounding and date rules every payroll number follows (Part 2).
**Governing docs (Part 1):** ADR-029 (current design, supersedes ADR-014's lifecycle and model), ADR-014 (engine and run atomicity, partly superseded), ADR-041 (transactions for multi-document writes), ADR-011 (policy resolution), ARCHITECTURE.md § Payroll (line ~194; its paragraphs after "The paragraphs below describe the original Phase 7 design" are superseded by ADR-029), ENGINEERING.md § 28 (Payroll), § 27 (Effective dating), § 26 (Policy resolution), § 33 (Transactions).
**Governing docs (Part 2):** ENGINEERING.md § 28 (Payroll: configurable rules, reproducibility, no hardcoded formulas), § 27 (Effective dating), § 26 (Policy resolution); ADR-029 (Decision: calculation engine, attendance, rule versions, compensation); ADR-014 (Decisions 1 and 2; Decision 1 on computed vs. HR-supplied lines); ADR-011 (resolver origin); ADR-057 (computed overtime, rest-day, holiday and night pay); ARCHITECTURE.md § Payroll (the engine paragraph, ~line 198).
**Last verified:** 6587050 (Part 1); 83ab0ba, attendance engine plan Phases 5-6 (Part 2). Merged from the former `payroll.md` and `payroll-engine.md` on 2026-11-15.

---

## Part 1: Runs, compensation, schedules

### Services
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
- Engine and tax: see Part 2 below.


### Models
(`src/server/db/models/`, all exported from `index.ts`):
- `payroll-run.ts` `PayrollRunModel`: `runNumber` (unique per org), `payPeriodStart/End`, `payDate`, `policyId`, `ruleVersionId` (snapshots), `projectId?`, `status` (`PAYROLL_RUN_STATUSES`, default `draft`), `source` (manual or schedule), per-step user ids, `computeLock`/`computeLockUntil`, `history[]`, `totals`, `exclusions[]`, `blockingIssues`, `warningCount`.
- `payroll-record.ts` `PayrollRecordModel`: one per run and employee (unique `{payrollRunId, employeeId}`); stores inputs (`rate`, `monthlyBasic`, `dailyRate`, `hourlyRate`, `attendance`), lines (`earnings`, `contributions`, `deductions`), totals, `warnings`, `previousNetPay`, name and number snapshots.
- `payroll-adjustment.ts` `PayrollAdjustmentModel`: HR inputs per run and employee (`category`, `label`, `direction`, `amount`, `taxable`).
- `payroll-policy.ts` `PayrollPolicyModel`: `payFrequency`, `workDaysPerYear` (default 261), `hoursPerDay` (8), `workWeekDays`, `deductLateAndUndertime`, `contributionTiming`, premium multipliers, `finalPayDeadlineDays`, `effectiveFrom` (default now), `status`, optional `projectId`.
- `payroll-rule-version.ts` `PayrollRuleVersionModel`: `versionNumber` (unique per org), `taxTables`, `contributions`, `basedOnVersionId`, `status` (default `active`), `effectiveFrom` (default now), optional `projectId`.
- `compensation.ts` `CompensationModel`: effective-dated pay terms per employee (`rateType`, `rate`, `allowances[]`, `minimumWageEarner`, `effectiveFrom`, `effectiveTo`, `batchId`). Indexes include `{employeeId, effectiveFrom}`, but there is no unique constraint.
- `payroll-schedule.ts` `PayrollScheduleModel`: `payFrequency`, `cutoffDay`, `payDateOffsetDays`, `autoPrepare`, `status`, `startsOn`, `lastPreparedPeriodEnd`, `lastRunId`, `lastError`, `lastAttemptAt`, optional `projectId`. Not listed in ARCHITECTURE.md's model list.
- Related, owned elsewhere: `src/server/db/models/final-settlement.ts` (domain: `src/domains/final-settlement/`) reuses `payPremiumsOf` and `roundMoney`.


### Routes
(`src/app/api/`; every handler calls `requirePermission(...)` first):
- `payroll-runs/route.ts`: GET (`payroll-runs.read`), POST = prepare (`payroll-runs.create`).
- `payroll-runs/[id]/route.ts`: GET detail (`payroll-runs.read`); PATCH `{action}` with the permission per action from `PERMISSION_BY_ACTION`: recompute, submit, cancel → `payroll-runs.update`; approve, return → `payroll.approve`; release → `payroll.release`. `recompute` and `submit` also call `enforceRateLimit("payrollCompute")`.
- `payroll-runs/[id]/adjustments/route.ts` (POST) and `[adjustmentId]/route.ts` (DELETE): `payroll-runs.update`.
- `payroll-runs/[id]/export/route.ts` (GET, `payroll-runs.read`, `auditExport`).
- `payroll-policies/` and `payroll-rule-versions/` (GET/POST; `[id]` PATCH with `.update`).
- `payroll-schedules/route.ts` (GET/POST), `[id]/route.ts` (PATCH), `prepare/route.ts` (POST, `payroll-runs.create`, calls `prepareDue`).
- `compensation/route.ts` (GET, POST), `[employeeId]/route.ts` (PATCH, `compensation.update`), `bulk/route.ts` (POST: `compensation.read` for preview, `compensation.update` for apply).
- `src/app/api/cron/payroll-schedules/route.ts` (GET): `checkCronAuthorization`; 503 when `CRON_SECRET` is unset; calls `prepareDueBatch()` for all organizations.
- Permission key strings are defined outside the payroll folder (Phase 4 territory; `src/server/authorization/`).


### Pages
(`src/app/(app)/payroll/`):
- `page.tsx` (list; also calls `PayrollScheduleService.prepareDue` in `after()` when the user can create runs), `new-run-dialog.tsx`, `payroll-status-badge.tsx`, `loading.tsx`.
- `[id]/page.tsx` (run detail, exclusions panel), `[id]/run-actions.tsx`, `[id]/run-register.tsx` (adjustment form), `[id]/payslips/page.tsx` and `print-button.tsx`, `[id]/run-types.ts`.
- `policies/page.tsx` and `create-payroll-policy-dialog.tsx`.
- `rule-versions/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `rule-version-editor.tsx`.
- `compensation/page.tsx`, `compensation-form-dialog.tsx`, `bulk-change-dialog.tsx`.
- `schedules/page.tsx`, `schedule-dialog.tsx`, `prepare-now-button.tsx`.
- Also linked from `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/people/[id]/page.tsx`, `src/components/shared/nav-links.tsx`.


### Tests
- `tests/domains/payroll/payroll-run-service.test.ts` (10 cases: prepare scope, double-pay guard, lifecycle, adjustments lock, blocking issues, released run immutability, net-pay warning).
- `tests/domains/payroll/compensation-service.test.ts`, `payroll-schedule-service.test.ts`, `payroll-rule-version-service.test.ts`, `payroll-attendance.test.ts`, `payroll-register-export.test.ts`, `cross-organization-integrity.test.ts`, `pay-premiums.test.ts`, `ph-statutory-template.test.ts`, `payroll-engine.test.ts`, `payroll-tax.test.ts` (engine files: see Part 2 below), fixtures in `tests/domains/payroll/fixtures.ts`.
- No UI test for the payroll pages under `tests/app/` (only `settlement-actions.test.tsx` matches a search for "settlement", and it was not checked for payroll content).
- `tests/e2e/payroll-run.spec.ts` (Playwright, 1 test).
- `tests/lib/money.test.ts` (rounding, shared with the engine).


### Rules a change must respect
- **Compute, then write.** `computeRun` gathers everything, computes in memory, then deletes and inserts records and saves totals in one `withTransaction` (`src/domains/payroll/payroll-run-compute.ts`, end of `computeRun`; ADR-041). Keep the write group small and pass `{ session }` to every write.
- **Only drafts are recomputed or changed.** Recompute, adjustment changes and submit all run inside `withComputeLock`, which only takes a lock on `status: "draft"` (`payroll-run-guards.ts`). Released and approved runs are never rewritten (`payroll-run-compute.ts` relies on this).
- **Recompute uses the run's snapshot.** `computeRun` loads `run.policyId` and `run.ruleVersionId`, never the currently active policy or version (`payroll-run-compute.ts`, top of `computeRun`). A new rule version reaches a run only if the run is prepared again.
- **Double-pay guard.** `assertNoOverlap` (`payroll-run-guards.ts`): an organization-wide run conflicts with any non-cancelled run over overlapping dates; a project run conflicts with organization-wide runs and runs for the same project. Released runs always block, because `cancel` is only allowed from `draft` or `submitted` (`TRANSITIONS` in `payroll-run-service.ts`).
- **Run types (payroll plan, ADR-058 to ADR-061).** `runTypeOf` reads a run without `runType` as regular. The guard is type-aware (`runsConflict`): different types never conflict; same type conflicts on overlapping dates and scopes; `final` conflicts per employee. A regular run leaves out an employee whose approved or released final run covers its dates. 13th-month, year-end and final runs keep their inputs on the record (`thirteenthMonth`, `yearEnd`, `finalSettlement`).
- **Pay frequency is data (ADR-063).** Weekly, bi-weekly (anchor date on the schedule), semi-monthly, monthly. Monthly needs `acknowledgeMonthlyPay` (validation and `monthlyPayAcknowledgement` in the services); keep both checks.
- **Prepare checks the second time.** `prepare` creates the draft, runs `assertNoOverlap` again excluding later-created runs, then computes. Any failure deletes the run and its records (`payroll-run-service.ts`, `prepare`).
- **Transition table is the only state machine.** `TRANSITIONS` in `payroll-run-service.ts`: submit (draft→submitted), approve (submitted→approved), return (submitted or approved→draft, reason required), release (approved→released, `releasedOn` and optional `paymentReference`), cancel (draft or submitted→cancelled, reason required). `act` applies each transition with a conditional `findOneAndUpdate` that matches the status read earlier, and returns 409 on a lost race.
- **Submit recomputes under the lock first.** It refuses an empty run ("There's no one to pay") and any `blockingIssues > 0` (`payroll-run-service.ts`, `act`, `submit` branch).
- **Self-approval is allowed and recorded**, not blocked: `metadata.selfApproved` in the audit entry (`payroll-run-service.ts`, `approve` branch; ADR-029 Decision).
- **Nothing is deleted.** Runs are cancelled, not removed. Adjustments are deleted only in draft, and each removal is audited with its prior values (`removeAdjustment`).
- **Every state change is audited and in `history`.** Each transition pushes a `history` entry and calls `AuditService.record` (`payroll-run-service.ts`).
- **Pay terms are a dated row per employee.** `CompensationService.revise` (`compensation-service.ts`) closes the latest row the day before and creates a new one; it never edits a past row. Bulk apply (`applyBulkChange`) does the same for many employees in one transaction with a shared `batchId`.
- **Policy and rule version are resolved on purpose.** Policy by pay period end, rule version by pay date (`PayrollRunService.prepare`). Pay terms by period end (`computeRun`, `getAsOfForEmployees(end)`). Detail in Part 2 below.
- **Permission per action.** Keep `PERMISSION_BY_ACTION` (`src/app/api/payroll-runs/[id]/route.ts`) and the service `TRANSITIONS` in step when adding an action.
- **Schedules only prepare drafts.** `prepareDueBatch` never submits, approves or releases (`payroll-schedule-service.ts`; ADR-029). It is idempotent: a non-cancelled run with the same org, project and period counts as done (`existingRuns` check).
- **Schedule cap.** At most `PREPARE_LIMIT_PER_PASS` (3) prepares per pass; the rest are "deferred" (`payroll-schedule-service.ts`). Failures are stored on the schedule (`lastError`), not thrown. Only an `AppError` message is stored; any other error is logged and the schedule shows a generic sentence (2026-11-15).
- **Cron is off without a secret.** `src/server/security/cron-auth.ts` returns "unconfigured" when `CRON_SECRET` is missing, and the route answers 503.
- **Project scope is partial.** List (`payroll-runs/route.ts`) and detail GET (`payroll-runs/[id]/route.ts`) use `requireAccessibleProjects`, so a project-scoped holder sees only their projects' runs. PATCH actions, adjustments and export use organization-wide `requirePermission`, so a project-scoped holder is refused there (ARCHITECTURE.md § Known gaps; ADR-043). Project runs select employees by project as of the period end (`projectsAsOf`, `payroll-scope.ts`).
- **Compensation rows are inclusive dates.** A row applies from `effectiveFrom` through `effectiveTo`, both included (`compensation.ts` model comment; `appliesOn` in `compensation-service.ts`).


### Known gaps / mismatches
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

---

## Part 2: Calculation engine, rule versions, tax, money, effective dating

### Services
- `src/domains/payroll/engine/compute-pay.ts`: `computeEmployeePay(input)` returns `PayResult` (earnings, contributions, deductions, gross, taxable income, tax, net, warnings).
- `src/domains/payroll/engine/contributions.ts`: `computeMonthlyContributionExact(rule, monthlyBase)` (unrounded, used before per-cutoff split), `computeMonthlyContribution` (rounded).
- `src/domains/payroll/payroll-tax.ts`: `computeProgressiveBracketTax(taxableIncome, brackets)`.
- `src/domains/payroll/engine/pay-frequency.ts`: `periodsPerMonth`, `perPeriodFromMonthly`, `isLastCutoffOfMonth`, `PAY_FREQUENCIES`.
- `src/domains/payroll/engine/pay-periods.ts`: `periodEndingOnOrBefore`, `periodContaining`, `nextPeriod` (schedule cutoffs).
- `src/domains/payroll/engine/premiums.ts`: `PAY_PREMIUM_DEFAULTS` (overtime, rest day, special day, special on rest day, regular holiday, regular on rest day, premium overtime, night differential, 13th-month divisor), `payPremiumsOf(policy)`, `formatMultiplierPercent`.
- `src/domains/payroll/engine/premium-pay.ts`: `premiumLines({ days, dailyRate, hourlyRate, hoursPerDay, premiums })`, `formatHoursMinutes` (ADR-057).
- `src/domains/payroll/holiday-day-types.ts`: `HOLIDAY_DAY_TYPE_DEFAULTS`, `holidayDayTypesOf(policy)`, `isDayOffDayType`.
- `src/domains/payroll/payroll-premium-inputs.ts`: `loadPremiumContext` (the period's holidays per employee, previous-workday facts, the record snapshot), `PREMIUM_ENGINE_VERSION`.
- `src/domains/payroll/engine/money.ts`: `sumMoney`; re-exports `roundMoney` from `src/lib/money.ts`.
- `src/lib/money.ts`: `roundMoney`, `formatMoney` (₱ display), `formatAmount` (no symbol). Shared by payroll, clearance and final settlement.
- `src/server/policies/resolve-org-project-policy.ts`: `resolveOrgProjectPolicy(model, params)`, the shared Organization→Project resolver used by policies and rule versions.
- `src/domains/payroll/templates/ph-statutory-2025.ts`: `PH_STATUTORY_2025`, the seed template for the "Philippines 2025" rule version (used at `scripts/seed.ts`, line ~445).
- `src/domains/payroll/payroll-attendance.ts`: `summarizeAttendance()` (rules in the Attendance section below).


### Models
- `src/server/db/models/payroll-rule-version.ts` `PayrollRuleVersionModel`: `taxTables[] {payFrequency, brackets[] {minIncome, maxIncome?, rate, baseDeduction}}`, `contributions[] {code, name, floor?, ceiling?, extraLabel?, rows[] {from, to?, employeeRate?, employerRate?, employeeAmount?, employerAmount?, extraAmount?}}`, `versionNumber`, `status`, `effectiveFrom`, `projectId?`.
- `src/server/db/models/payroll-policy.ts` `PayrollPolicyModel`: pay math parameters (`payFrequency`, `workDaysPerYear`, `hoursPerDay`, `workWeekDays`, `deductLateAndUndertime`, `contributionTiming`) and premiums (`overtimeMultiplier` 1.25, `restDayMultiplier` 1.3, `specialHolidayMultiplier` 1.3, `specialHolidayRestDayMultiplier` 1.5, `regularHolidayMultiplier` 2, `regularHolidayRestDayMultiplier` 2.6, `premiumOvertimeMultiplier` 1.3, `nightDifferentialRate` 0.1, `thirteenthMonthDivisor` 12; range checks in the schema) and `holidayDayTypes` (what each holiday type counts as).
- `payroll-run.ts`: `computePremiums` (set on new regular runs). `payroll-record.ts`: `premiumInputs` snapshot.
- `src/server/db/models/compensation.ts`: input rows (`rateType`, `rate`, `allowances[] {name, amount, basis, taxable}`, `minimumWageEarner`).


### Routes
`src/app/api/payroll-rule-versions/` (GET, POST, PATCH `[id]`), `src/app/api/payroll-policies/` (GET, POST, PATCH `[id]`). Engine itself has no route; it runs inside `computeRun`.

### Pages
`src/app/(app)/payroll/rule-versions/` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `rule-version-editor.tsx`), `src/app/(app)/payroll/policies/` (`page.tsx`, `create-payroll-policy-dialog.tsx`, which shows premiums and the 13th-month divisor).


### Tests
- `tests/domains/payroll/payroll-engine.test.ts` (16 cases: rounding, contribution row matching and clamping, cutoffs, monthly and daily pay, mid-period proration, adjustments, rest-day warning, missing attendance, negative net pay).
- `tests/domains/payroll/payroll-tax.test.ts` (5), `payroll-attendance.test.ts` (3), `pay-premiums.test.ts` (10), `ph-statutory-template.test.ts` (4), `payroll-rule-version-service.test.ts` (7).
- `tests/lib/money.test.ts` (shared rounding).
- Cutoff tests (`pay-periods`, `pay-frequency`) are inside `payroll-engine.test.ts`; schedule-level behaviour is in `payroll-schedule-service.test.ts`.


### Rules a change must respect
- **Engine stays pure.** `computeEmployeePay` takes resolved inputs only, with no I/O (`compute-pay.ts`, header comment). Load data in `computeRun`, not here.
- **No rates in code.** Contribution and tax numbers come from rule data (`payroll-tax.ts` header; `contributions.ts` header; ENGINEERING § 28). Never add a `* 0.05`.
- **Rounding: half away from zero at centavos.** `roundMoney` scales by 100, re-reads at 12 significant digits to kill float noise, then rounds (`src/lib/money.ts`). Each line is rounded as produced; totals are `sumMoney` of rounded lines, so a payslip always adds up (`compute-pay.ts`, header comment; `engine/money.ts`).
- **Intermediate rates are rounded too.** `dailyRate`, `monthlyBasic` and `hourlyRate` are rounded to centavos before use. Tardiness uses the rounded `hourlyRate` (`compute-pay.ts`), so the rate rounding carries into pay.
- **Display matches the engine.** Format money through `formatMoney`/`formatAmount` only (`src/lib/money.ts`; `payroll-register-export.ts` uses `roundMoney`/`sumMoney`).
- **Monthly-rated pay.** Full month: `rate / periodsPerMonth` (`compute-pay.ts`, `basic`). Partial (`eligibleDays < scheduledDays`): `dailyRate × eligibleDays`. Absences: `dailyRate × absentDays`, deducted as a taxable earning line.
- **Daily rate.** Monthly-rated: `rate × 12 / workDaysPerYear` (261 for a 5-day week, 313 for 6, per ADR-029 and the policy default). Daily-rated: `monthlyBasic = rate × workDaysPerYear / 12`.
- **Daily-rated pay.** `dailyRate × (daysWorked + paidLeaveDays)`. Paid leave counts for daily-rated staff only (`compute-pay.ts`, `else` branch).
- **Tardiness and undertime** are deducted only when `policy.deductLateAndUndertime` is true, at the hourly rate × minutes ÷ 60 (`compute-pay.ts`, `tardiness`). Late minutes count only on "late" days; undertime is any check-out before the standard end (`payroll-attendance.ts`).
- **Allowances.** Monthly-basis allowances are `amount / periodsPerMonth`, scaled by eligible share for partial periods. Daily-basis allowances are `amount × daysWorked` (not paid leave) and skipped when `daysWorked` is zero (`compute-pay.ts`, allowance loop).
- **Contributions.** Base is the monthly basic pay (a daily rate's monthly equivalent for daily-rated staff), not the period's pay. Row matching uses the unclamped base; floor and ceiling clamp only the rate base (`contributions.ts`, `computeMonthlyContributionExact`). A row's fixed amount wins over its rate when set (`row.employeeAmount ?? rate × base`).
- **Contribution timing.** `every_cutoff` takes `1 / periodsPerMonth` each cutoff; `last_cutoff_of_month` takes the whole month on `isLastCutoffOfMonth` (`compute-pay.ts`, `contributionShare`; `pay-frequency.ts`). Weekly periods use 52/12 per month.
- **Taxable income.** Sum of taxable earning lines (including taxable adjustments), minus the employee's contributions, floored at zero (`compute-pay.ts`, `taxableIncome`). Non-taxable allowances and adjustments are excluded. Deductions (loans, cash advances) come after tax and are not taxable.
- **Withholding tax** uses the table for the policy's pay frequency only (`run-compute` finds `taxTables` by `payFrequency`). Minimum wage earners pay zero tax (`compute-pay.ts`, `tax`). Bracket lookup is `minIncome ≤ income < maxIncome`, then `baseDeduction + rate × (income − minIncome)` (`payroll-tax.ts`).
- **Net pay** = gross − (employee contributions + tax + other deductions) (`compute-pay.ts`, `netPay`). A negative net pay adds a blocking warning (`negative_net_pay`).
- **Premiums (ADR-057), only on runs with `computePremiums`.** Regular hours on a premium day: daily rate × multiplier × minutes ÷ (hours per day × 60), only the extra (multiplier − 1) when basic already pays the day (it is in the work week); a day outside the work week counts as a rest day. Overtime: hourly × 1.25, or × day multiplier × 1.3 on premium days, approved overtime only. Night: hourly × day multiplier × 0.10, at the overtime rate for night overtime. One line per kind of day and pay type, rounded as produced. Daily-rated staff get unworked regular holidays (one daily rate) when the workday before was attended or on leave; monthly-rated have them in basic; absence before warns, never deducts. Manual `overtime`/`holiday_pay`/`rest_day_pay`/`night_differential` adjustments are refused on such runs. Runs without the flag compute exactly as before.
- **Warnings are data.** Codes produced: `missing_attendance` and `rest_day_work` (engine; the reminder only on runs without premiums), `unapproved_overtime`, `missing_checkout`, `day_result_missing`, `holiday_absent_before`, `manual_premium_adjustment` (blocking), `negative_net_pay` (blocking, engine), `pay_terms_changed` and `net_pay_change` (added in `computeRun`; net change threshold 20%, `NET_PAY_CHANGE_THRESHOLD` in `payroll-run-compute.ts`).
- **Effective dating by day.** A policy, rule version or pay term applies on a day if `effectiveFrom` ≤ end of that day and `effectiveTo` ≥ start of that day, status `active`, most recent `effectiveFrom` wins (`resolve-org-project-policy.ts`, `effectiveFilter`). Compensation rows are inclusive day ranges (`compensation-service.ts`, `appliesOn`).
- **Which date picks which rule.** Policy: pay period end. Rule version: pay date ("Tax and contribution rates follow the pay date", `payroll-run-service.ts`, `prepare`). Pay terms: period end (`computeRun`, `getAsOfForEmployees(end)`). A change inside the period uses the period-end terms for the whole period and warns.
- **Premiums are configuration.** `PAY_PREMIUM_DEFAULTS` are schema and read defaults, and `payPremiumsOf` fills them for older policies (`premiums.ts`). Keep old policies readable when adding a field.
- **Cutoffs.** Semi-monthly: a period ending on day ≥ 16 is the month's last cutoff (`pay-frequency.ts`). Weekly: last when the next period ends in another month.
- **Attendance reading** (`payroll-attendance.ts`, `summarizeAttendance`): with premiums, records that have a stored day result give late, undertime and the premium days, and a day-off holiday is neither missing nor absent. Always: only employed days count; workdays are the policy's `workWeekDays`; "absent" is unpaid; "on_leave" is paid leave; any other status is worked; no record is "missing" (reported, never guessed); work on non-workdays is `restDaysWorked`.
- **Rule versions are never edited in place** (ADR-014 Decision 2; `payroll-rule-version-service.ts`, `create`). Corrections create a new `versionNumber`.


### Known gaps / mismatches
- **Resolved by ADR-057 for new runs (premium percentages unverified against the official Labor Code text, Arts. 86, 87, 93, 94). Was:** Premium multipliers are not applied. `overtimeMultiplier` is used only in UI text (`src/app/(app)/payroll/[id]/run-register.tsx`, "regular overtime is …"). `restDayMultiplier` appears only in a warning message (`compute-pay.ts`). Overtime, holiday pay, night differential and rest-day pay are HR-entered amounts (ADR-014 Decision 1; `adjustment-categories.ts`). The engine does not compute them.
- **13th-month divisor is used only by final settlement** (`src/domains/final-settlement/settlement-calculator.ts`, `thirteenthMonthDivisor`). Payroll runs do not compute 13th month pay; the ₱90,000 exemption is HR's job (`adjustment-categories.ts` header comment).
- **Effective dating vs. ENGINEERING § 27.** § 27 says historical calculations use the configuration applicable on their transaction date. A mid-period pay rate change applies the period-end terms to the whole period, with a warning only (`computeRun`; ADR-029 Consequences says so). Confirm this is the intended rule.
- **Overlapping rule versions are silently resolved.** No overlap check at create (`payroll-rule-version-service.ts`). The newest `effectiveFrom` wins.
- **Tax and contribution numbers need verification.** ADR-029 says the seed uses PH-accurate tables. ADR-014 says the seeded numbers are "illustrative example data, not authoritative". The template (`templates/ph-statutory-2025.ts`) has weekly, semi-monthly and monthly brackets and SSS, PhilHealth (2.5% + 2.5%, floor ₱10,000, ceiling ₱100,000) and Pag-IBIG (ceiling ₱10,000). This document does not verify the figures against official schedules.
- **Rate rounding in tardiness.** The rounded hourly rate is multiplied by minutes (`compute-pay.ts`), so the deduction can differ by centavos from an unrounded calculation. No doc states this choice.
- **Not computed:** double regular holidays (300%), unworked regular holidays on a rest day for daily-rated staff. Night differential and holiday premiums are computed on new runs (ADR-057). Categories carry only suggested taxable flags (`adjustment-categories.ts`).
