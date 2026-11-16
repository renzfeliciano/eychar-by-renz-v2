# Plan: Payroll enhancement (compliance, run integrity, final pay)

**For:** an implementing agent (Opus). **Written:** 2026-11-14 against commit `6587050`.
**Status:** plan only. Nothing here is implemented. Paths come from the `knowledge/` base; re-check them in
the source before relying on them (line numbers drift).
**Companion plan:** [attendance-engine-enhancement.md](./attendance-engine-enhancement.md). This plan
**starts after that plan's Phases 1–5 are merged.** Overtime, rest-day, holiday and night-differential pay
are computed there and are **not** repeated here.

## 0. How to work

1. Read, in order: `knowledge/README.md`, `overview.md`, `reference/layers.md`, `CHANGE_PROTOCOL.md`,
   `domains/payroll.md` (runs and engine), `domains/final-settlement.md`,
   `reference/philippine-payroll-compliance.md`, `known-gaps-and-mismatches.md`, `reference/cross-cutting.md` (money, dates, audit),
   `reference/testing.md`; then `docs/engineering/ENGINEERING.md` §§ 27, 28, 33, 35, 46, 52, 53, 58–60 and ADR-011, 014, 029, 032, 041.
2. Follow `CHANGE_PROTOCOL.md`: brief, baseline (`npm run typecheck`, `lint`, `npm test`), small additive slices on a
   branch, never on `main`.
3. **Stop at every GATE.** This work changes payroll results and data shape.
4. Use `brainstorming` before Phases 2, 3 and 5, and `test-driven-development` throughout.
5. Never bend: extend the engine, do not rewrite it (§52). No rates, caps, divisors or dates in code; they are
   rule or policy data (§2, §28). Everything effective-dated (§27). Rule versions are never edited in place
   (ADR-014 Decision 2). Released and approved runs are never rewritten. Never read or copy `.env.local`.

## 1. Goal

Make payroll correct and defensible under Philippine rules, and close the integrity gaps found in the
exploration, without changing any past result:

- Pay the 13th month to all employees. (Tracking the ₱90,000 exemption is **deferred**, decided 2026-11-14.)
- Let HR record a resignation as a resignation, not only a termination (Phase 5a).
- Produce year-end tax reconciliation data and Form 2316 data.
- Make the run lifecycle safe against partial writes and silent exclusions.
- Finish the final-pay design (ADR-032), with controls.
- Keep statutory tables current and verified. Let HR **choose** the pay frequency (monthly, semi-monthly or
  bi-weekly), with the Art. 103 risk of monthly pay shown and acknowledged, not forbidden.

**Non-goals:** premium pay from attendance (companion plan), government remittance files (SSS R-3,
PhilHealth RF-1, Pag-IBIG MCRF), e-filing with BIR, multi-country rules, project-scope fixes (B11) and export
auditing (C8, both decided as separate follow-ups).

## 2. Facts the plan stands on (verify before coding)

- A run is prepared as a draft, computed in memory, then written in one `withTransaction`. Only drafts are
  recomputed or changed. Recompute uses the run's stored `policyId` and `ruleVersionId`, never the current ones
  (`payroll-run-compute.ts`).
- Policy resolves by pay-period end, rule version by pay date, pay terms by period end. A mid-period pay-term change is
  blended by scheduled workdays (`engine/rate-segments.ts`, implemented 2026-11-14).
- `assertNoOverlap` (`payroll-run-guards.ts`) blocks any non-cancelled run with overlapping dates. It has no
  notion of run type, so **a 13th-month or final run over the same dates would be refused today.**
- Employees with no pay terms are listed in `run.exclusions`, and the run can still be submitted.
- `Compensation.revise` closes the old row, then creates the new one, with no transaction.
- `addAdjustment` / `removeAdjustment` write, then call `computeRun`. A failed recompute leaves the change committed.
- `PayrollPolicy` carries `thirteenthMonthDivisor` (12) and `finalPayDeadlineDays` (30). The 13th month is used only
  by final settlement (`settlement-calculator.ts`). The `thirteenth_month` adjustment category is non-taxable,
  and nothing tracks the ₱90,000 total.
- Final settlement computes lines, has maker-checker on approve only, and **does not** create a `final` payroll run,
  hash its lines, run variance checks, or require an attachment on manual lines. The dashboard reads
  `Organization.compliance.finalPayDays`, the settlement reads `PayrollPolicy.finalPayDeadlineDays`; the two
  are not reconciled.
- New policies and schedules were **monthly only** (decided earlier on 2026-11-14), then changed the same day:
  **HR chooses the frequency** (§5 item 4). `pay-frequency.ts` accepts weekly and semi-monthly; bi-weekly is unsupported.
- The statutory template is `src/domains/payroll/templates/ph-statutory-2025.ts`. Tax brackets were corrected to the
  centavo on 2026-11-14. Contribution figures are **not** verified against official issuances.

## 3. Phases

Each phase ships alone, passes all gates, and leaves existing behavior unchanged unless stated.

### Phase 1: Run integrity (no change to pay results)

| Item | Problem | Change |
|---|---|---|
| 1a. `Compensation.revise` (B7) | Not transactional; a failure between the two writes leaves no open pay-terms row, so the next run silently excludes the employee. | Wrap both writes in `withTransaction` (ADR-041), pass `{ session }`. Test the failure path. |
| 1b. Adjustments vs recompute | Row is written, then recompute may throw. | Compute first, write the adjustment and the new records in one transaction, or roll the adjustment back on failure. Keep the compute lock. |
| 1c. Exclusions gate | A run with excluded employees can be submitted without anyone noticing. | Add a blocking-style acknowledgement: submit needs HR to confirm the exclusion list, recorded in `history` and the audit entry. Do not block automatically (see §5 item 7). |
| 1d. Overlapping versions | `create` in the policy and rule-version services has no overlap check. | Reject a second active row with the **same scope and the same `effectiveFrom`**. Newest-`effectiveFrom`-wins stays as designed. |
| 1e. Draft staleness | A corrected rule version does not reach existing drafts, with no signal. | Show a notice on a draft when a newer applicable version exists. Do not change the snapshot rule. |
| 1f. Docs | ADR-029 and the code disagree on prepare permission (`payroll-runs.create`). ARCHITECTURE.md is stale (`PayrollService.generateRun()`, no `PayrollSchedule`). | Fix the docs to match the code. Record in the gaps file. |

### Phase 2: Run types and the double-pay guard

Prerequisite for Phases 3 and 5.

- Add an optional `runType` to `PayrollRun`: `regular` (default for every existing row), `thirteenth_month`,
  `year_end_adjustment` (if chosen in §5), `final`. Old rows read as `regular`. No backfill is required if the read
  default is applied everywhere. If a backfill is needed, make it idempotent with a dry run.
- Make `assertNoOverlap` **type-aware**: a non-regular run may overlap regular runs, but two runs of the **same type
  and same employee period** still conflict. Keep project/org rules. Add tests for every pair.
- The state machine (`TRANSITIONS`) and permissions stay shared. Keep `PERMISSION_BY_ACTION` and the service in step.
- Payslips, the register export and the run list show the run type.
- Audit: run-type is in the existing run audit metadata.

**GATE A:** show the type-aware overlap matrix and the schema change before building on it.

### Phase 3: 13th-month pay (PD 851), mandatory for all employees

The ₱90,000 exemption is **deferred** (owner, 2026-11-14): do not build a ledger or a cap. Keep today's behavior, where
the `thirteenth_month` category is non-taxable and HR marks any excess as taxable by hand. Record that risk in the
gaps file: until the cap is tracked, a 13th month above ₱90,000 can go untaxed, and the Phase 4 year-end true-up
will not catch it because it only sees what was flagged taxable.

Design with `brainstorming` first. Proposed shape (confirm at the gate):

- A `thirteenth_month` run, prepared for a calendar year, paid by December 24 (the date is policy data, not code).
  It reads **released regular records** for the year.
- **Base:** basic salary actually earned in the calendar year: the `basic` earning lines, net of unpaid absences and
  tardiness lines. **Excludes** overtime, premiums, allowances and adjustments. Amount = base ÷
  `thirteenthMonthDivisor`, rounded with `roundMoney`. The compliance file notes one source includes overtime;
  PD 851 does not. Verify the base against the official rules at the gate.
- Partial years (hired or separated mid-year) use the base earned. Employees paid through final settlement are
  excluded if their 13th month was already paid there (use the same formula, "already paid" lookup).
- The snapshot rule applies: store the inputs (months worked, base earned, divisor) on the record.
- **Mandatory for every employee**, with no eligibility setting (owner, 2026-11-14). That includes managerial staff,
  whom PD 851 does not cover by statute, so for them it is a company policy benefit. Say so in the ADR. The due date
  (December 24) is policy data.
- Add the data export for DOLE's annual 13th-month compliance report (due January 15; verify).
- Tests: full year, partial year, absence and tardiness reductions, overtime excluded, a rate change mid-year, an
  employee separated mid-year (resigned and terminated both get the pro-rated amount), a re-run of the same year refused.

**GATE B:** hand-calculated examples for three employees (full year, mid-year hire, mid-year resignation), checked
against PD 851 and the DOLE rules on what counts as basic salary.

### Phase 4: Year-end tax reconciliation and Form 2316 data

- **Annualized withholding true-up:** per employee, compare tax withheld in the year to the annual tax on annual
  taxable income, using the annual TRAIN table in the rule version. Output the over- or under-withholding.
- Provide it as a **report and a proposed adjustment** (a `year_end_adjustment` run, or adjustment lines on the
  last December regular run, see §5 item 3). HR approves it. Never applied silently.
- **Form 2316 data:** an export (XLSX/CSV) of the fields the form needs per employee. A printable form is a follow-up
  only after the official layout is checked.
- **Prior-employer income for mid-year hires is in scope** (§5 item 3): an optional per-employee, per-year input that
  annualization includes. Flag employees with two or more employers, who must file their own return.
- Also export the **certified list of employees qualified for substituted filing** (BIR Annex F). Signature capture
  and e-filing stay out of scope.
- Audit the report generation and the adjustment, in line with how `auditExport` works for the register.

**GATE C:** confirm the field list and the annual table against the current BIR forms (RR 11-2018 and later
issuances) before building.

### Phase 5a: Record a resignation as a resignation

Independent of the payroll work. **Slice 1 can ship at any time and should ship first.** Final settlement (Phase 5)
needs it, because the pay-out depends on why employment ended.

**What the code does today** (read from source, 2026-11-14):

- The status catalog already has **`resigned` and `awol`**, both `isActiveHeadcount: false`, next to `terminated`
  (`scripts/seed.ts:521-526`).
- The backend already supports them. `EmploymentService.terminate` accepts `status`, `effectiveTo` and
  `terminationReason`, checks the status against the catalog, and audits `employment.terminated`
  (`src/domains/workforce/employment-service.ts:76-116`). `terminateEmploymentSchema` and
  `PATCH /api/employees/[id]/employment` accept the same fields.
- **The gap is the screen.** `TerminateButton` (`src/app/(app)/people/[id]/terminate-button.tsx`) sends only
  `organizationId`, so every ending becomes `terminated`, effective today, with no reason. That is why only
  "terminate" exists for users.
- A **second, separate list** records the same fact: the `SeparationType` catalog (resignation, end of contract,
  termination, retirement, redundancy, death), chosen when HR opens a clearance case. Clearance does not change the
  employment, and nothing links the two, so they can disagree (clearance says "Resignation", employment says "Terminated").
- `isActiveStatus` reads the **status**, not the end date. Setting a status with a future `effectiveTo` would drop
  the employee from active headcount at once. Check how payroll, attendance and the roster use `effectiveTo` before slice 3.

**Slices**

1. **End-employment dialog (UI only, no schema change).** Replace "Terminate employment" with **"End employment"**.
   The dialog asks for: the **reason** (a picker over active `EmploymentStatus` items where `isActiveHeadcount` is false,
   so Resigned, Terminated, AWOL and anything HR adds later, never a hardcoded list), the **effective date**
   (default today, past dates allowed), and a **note** (required for Terminated and AWOL, optional for the rest).
   Send `status`, `effectiveTo` and `terminationReason`. Also write the note into the audit `after`
   (today it records status and date only). Keep the `employees.update` permission, the confirm step and the
   "already ended" guard. Check `status-badge.tsx`, the roster filters and the profile for a `terminated`-only assumption.
   Tests: a component test, and a service test that `resigned` is stored, audited and not terminable twice.
2. **One choice drives both records.** Put a mapping on each `SeparationType` item as catalog metadata
   (for example `employmentStatusCode`), the same pattern as `isActiveHeadcount`. Resignation → resigned, Termination →
   terminated, and so on, configurable by HR. Opening a clearance then offers to end the employment with the mapped status
   on the last working day, and ending an employment offers to open clearance. Warn when the two disagree. Do not add a new
   field on `Employment` unless the owner wants one (§5 item 12).
3. **Done 2026-11-15 (ADR-064; owner: active until the date).** **Scheduled end (resignation with notice).** A resignation usually takes effect after a notice period. Keep the employee
   active until the effective date, and show "ending on <date>". Decide whether a daily job or a read-time check applies the
   status (the cron pattern already exists). Until built, slice 1 should tell HR to end the employment on the last working day.
4. **Done 2026-11-15 (ADR-064 item 5).** **Hand-off to final pay.** Phase 5's variance checks add "employment not ended or not yet effective", and the settlement reads
   the last working day from one source.

**Out of scope here, but flagged:** separation pay depends on the **cause** (authorized causes such as redundancy, retrenchment,
closure and disease carry separation pay; resignation and just-cause dismissal generally do not, unless a policy or contract
says so, **[verify the articles and their current numbering]**). The settlement calculator has **no separation-pay line today.**
Add it as its own change, driven by data on the separation type, only after the owner asks.

### Phase 5: Final settlement (ADR-032) completed

ADR-032 is accepted but only partly implemented (decided 2026-11-14). Close the gap list in `final-settlement.md`:

1. **Final payroll run:** `disburse` creates a `final` run (Phase 2) with one record, in the same transaction that
   closes the clearance (ADR-041). The record carries the settlement lines, so payslip, audit and register work as for any run.
2. **Tamper evidence:** store a hash of the lines and inputs on each approved version. Check it on disburse.
3. **Variance checks** as data (blocking or warning): negative net pay, leave cap, 13th month already paid, recent rate
   change, missing government IDs, tax true-up needed.
4. **Segregation of duties:** the preparer cannot review or approve (today only approve checks it).
5. **Manual lines** need a reason **and** an attachment. Reuse the document storage; no new storage layer.
6. **Statutory pieces:** tax true-up on final pay and contribution handling, using the same engine functions, not copies.
7. **One deadline source:** `PayrollPolicy.finalPayDeadlineDays` is the source. The dashboard reads it
   (`compliance-risks.ts`), falling back to `Organization.compliance.finalPayDays` only when no policy applies.
   Do not delete the old field. Verify the default (30 days) against DOLE guidance.
8. **Inputs-changed warning:** warn when source records changed after approval.
- The settlement must reuse `computeEmployeePay` pieces (rounding, tax, contributions). Do not fork the math.

**GATE D:** present the final-run design, the hash fields and the variance list before coding.

### Phase 6: Statutory data and pay frequency

**Status (2026-11-15): built.** Owner answers: unacknowledged monthly policies are flagged until acknowledged;
bi-weekly periods come from an anchor date per schedule; a bi-weekly run without a bi-weekly table refuses until
HR publishes a new rule version; service incentive leave is report only. Statutory tables unchanged (secondary
sources). Details: `reference/philippine-payroll-compliance.md` §4–5, known gaps B27–B28.

- **Tables:** verify SSS, PhilHealth, Pag-IBIG and withholding figures against the official sources listed in
  `reference/philippine-payroll-compliance.md` §6. Publish corrections as a **new rule version** (new `versionNumber`,
  never an in-place edit), effective-dated. Update the seed template and its test. Record what was checked.
- **Pay frequency is HR's choice** (owner, 2026-11-14), not forced. Monthly stays available. Because Art. 103 as the
  sources read it does not allow monthly pay for rank-and-file staff, choosing monthly must (a) show a plain warning in the
  policy and schedule dialogs, (b) require HR to tick an acknowledgement that is stored with the policy and audited, and
  (c) appear as a compliance risk on the dashboard. Never block it. The frequency is policy data, so nothing is hardcoded.
- **Frequency support:** make semi-monthly selectable for new policies and schedules (the engine already has it), and add
  **bi-weekly** (26 periods, `periodsPerMonth` 26/12, annual ÷ 26 tax table, cutoff and contribution timing rules).
  Existing monthly policies keep working.
- **Service incentive leave (Art. 95):** investigate only. Check whether the leave domain configures five days after a
  year of service. Report the finding; build only if the owner says so.
- Minimum-wage earners: leave the HR flag as is; add a documented reminder to check regional wage orders on each change.

### Phase 7: Payslips, register and exports

**Status (2026-11-15): built.** Payslips mark non-taxable earnings, state taxable income and explain 13th-month,
year-end and final runs (`payslips/payslip-card.tsx`). The run screen's payslip sheet shows a final run's settlement.
The register export adds "13th month", "Non-taxable earnings" and "Taxable income" columns, and its totals use
`sumMoney`. Profile payslips name the run type. Tests: `tests/app/payslip-card.test.tsx`,
`tests/domains/payroll/payroll-register-export.test.ts`. The payslips page keeps its own print header (not `PageHeader`, C5).

- Payslip and register show every new line (13th month, year-end adjustment, final lines) with their taxable flags.
- Register export columns follow the existing `roundMoney` / `sumMoney` rules, so totals add up.
- Keep `PageHeader`, `loading.tsx`, mobile layout (§41). Add UI tests, since payroll pages have none today.

### Phase 8: Verify and document

**Status (2026-11-15): done, except the running-app walk-through and e2e (no throwaway database configured).**
Tests: `tests/domains/payroll/payroll-phase-8-verification.test.ts` (history §59, reproducibility §46 for regular,
13th-month and year-end runs, authorization §60 for each run type); concurrency stays in `tests/security/races-2026-10.test.ts`.
ADRs 058–063 written; `ARCHITECTURE.md`, `domains/payroll.md`, `domains/final-settlement.md` and the compliance file updated.

- Gates: `npm run typecheck`, `lint`, `npm test`, `npm run build`; run the app and walk a regular run, a 13th-month run,
  a year-end adjustment, a final settlement and the payslip. Run `npm run test:e2e` for payroll.
- **Historical test (§59):** a past period recomputed with the rules in force on that date gives the same result after
  rules change. **Reproducibility (§46):** a stored record reproduces from its snapshot. **Authorization (§60):** HR scoped to the org
  can run each run type; a project-scoped holder cannot. Concurrency tests (they need a replica set, see C7).
- Update `knowledge/` payroll, engine, final-settlement and compliance files and the gaps file. Add ADRs for run types,
  the mandatory 13th month (including the managerial-staff note), the year-end adjustment, the final-run design, and
  the separation-status mapping. Update `ARCHITECTURE.md`.

## 4. Compatibility and risk

- **Preserved:** every released run and record, all existing policies and rule versions, existing response shapes
  (new fields optional), existing audit actions, the draft-only recompute rule, the snapshot rule.
- **Changed on purpose:** the overlap guard (type-aware), the submit gate (exclusion acknowledgement), final settlement
  (now creates a run), the deadline source.
- **Highest risks:** the 13th-month base (legal exposure if wrong), an untracked ₱90,000 exemption (excess 13th month can go untaxed until it is built),
  double payment of the 13th month between a regular run, the 13th-month run and the final settlement, and the type-aware
  overlap guard letting a duplicate through.
- **Rollback:** additive fields, defaults on read, no collection renames, no deletions. Any backfill keeps a report.

## 5. Decisions (drafted 2026-11-14 with a Philippine-law check)

The owner asked for these to be settled in line with Philippine standards. I checked each against web sources.
Almost all sources were **secondary** (news reports of DOLE advisories, law-firm and payroll-vendor articles,
PwC, KPMG and Grant Thornton notes). A few were agency documents (a BIR digest of RR 11-2018). **None of the
figures below is an official-text check.** Items marked **[verify]** still need the official issuance at the gate.
Confirm the ones marked **[owner]**: they change an earlier owner decision or add scope.

| # | Decision | Philippine basis and status |
|---|---|---|
| 1 | **13th month is its own run type** (`thirteenth_month`), same approval lifecycle, not an adjustment line. | Design choice. Law: PD 851. |
| 2 | **Base = basic salary actually earned in the calendar year**, net of unpaid absences and tardiness. Overtime, premiums, allowances and adjustments are excluded. Amount = base ÷ 12 (`thirteenthMonthDivisor`). Due **on or before December 24**, no deferment. Employees who resigned or were terminated get it **pro-rated** (it also belongs in final pay). | Deadline, ÷12 and the pro-rated entitlement are confirmed by DOLE reminders in the news. **The exclusion of overtime and allowances was not confirmed by the sources; it is from my knowledge of the PD 851 rules [verify at Gate B].** |
| 2a | **13th month is mandatory for every employee. No eligibility setting.** (Owner, 2026-11-14.) | Managerial employees are outside PD 851's statutory coverage unless the employer grants it (one source), so for them this is a company policy benefit. A long-standing practice can become binding, so write it into the ADR. |
| 2b | **₱90,000 exemption tracking is deferred.** (Owner, 2026-11-14.) | Existing behavior stays: `thirteenth_month` is non-taxable and HR marks any excess taxable by hand. Risk recorded in Phase 3. |
| 3 | **Year-end = annualization, proposed for HR approval.** It compares tax withheld in the year to annual tax on annual income, and includes **previous-employer income**. Capture previous-employer income as a per-employee input (in scope). Interim annualization in the last months is optional. Provide a **Form 2316 data export** and the **certified list of employees qualified for substituted filing** (BIR Annex F), plus a flag for employees who had two or more employers (they must file their own return). | Confirmed by BIR digest of RR 11-2018 and PwC/Grant Thornton/KPMG notes: annualization is the employer's December duty and includes prior-employer pay; Form 2316 reaches employees by **Jan 31**, signed copies go to the BIR by **Feb 28** (2024 was extended to Mar 31 by RMC 29-2024); a signature is required. **Signature capture and e-filing stay out of scope.** The ₱90,000 cap is from my knowledge, not the search **[verify]**. |
| 4 | **Pay frequency is HR's choice: monthly, semi-monthly or bi-weekly.** Monthly stays available, with a warning, a stored acknowledgement and a dashboard risk. It is never blocked. (Owner, 2026-11-14, replacing "monthly only".) | Art. 103 (wages at least twice a month or every two weeks, at intervals not over 16 days): sources say monthly pay is **not allowed** for rank-and-file, with a managerial or DOLE-exemption route that I could not verify. The acknowledgement records that HR knows. One source says the code was renumbered in 2015 (old Art. 103 → Art. 116); **cite the current article number only after checking [verify]**. |
| 5 | **Final settlement:** create the `final` run on disburse, hash on approve, variance checks, preparer cannot review, attachment on manual lines. Final pay must include **pro-rated 13th month, unused-leave cash conversion where convertible, and any tax refund or true-up.** The 30-day clock starts at the **separation date** and is **not paused by clearance**; clearance delay is shown as a compliance risk. | Confirmed (DOLE Labor Advisory 06-2020 as reported): 30 days from separation unless a more favorable policy applies; includes pro-rated 13th month, leave cash, tax refund. Case law (Milan v. NLRC) allows reasonable clearance, so sources frame the period loosely. Not pausing the clock is the cautious reading **[verify the advisory text]**. Certificate of employment within 3 days of request: **out of scope**, noted. |
| 6 | **One deadline source:** `PayrollPolicy.finalPayDeadlineDays`, default **30**. The dashboard reads it and falls back to the organization value only when no policy applies. | 30 days is confirmed by the same sources. |
| 7 | **Exclusions at submit need an acknowledgement with a reason per excluded employee** (for example unpaid leave, not yet hired). Not a hard block. | Design choice. An unpaid employee is a wage-payment risk, so the reason must be recorded. |
| 8 | **Reject a second active policy or rule version with the same scope and same `effectiveFrom`.** Newest wins otherwise. | Design choice. |
| 9 | **Service incentive leave: investigate only.** Check whether the leave domain gives five days a year after one year of service, with the legal exemptions modeled (establishments under 10 employees, employees already enjoying at least five days of paid vacation leave). | Five days after one year: confirmed. Exemptions confirmed by the sources. Cash conversion of unused SIL at year-end: from my knowledge **[verify]**. |
| 10 | **Out of scope:** government remittance reports (SSS, PhilHealth, Pag-IBIG) and e-filing. **Add one small report in Phase 3:** the data for DOLE's annual 13th-month compliance report, due **January 15**. | January 15 report: one source. **[verify]** |
| 11 | **Dependency:** the attendance plan Phases 1–5 land first. | Premiums are computed there. |
| 12 | **Resignation is recorded as its own status** through an "End employment" dialog (Phase 5a slice 1, ships first, no schema change). Separation types map to employment statuses by catalog data (slice 2). Scheduled end (slice 3) is built after the owner decides how a future end date should behave. **[owner]** | The status and backend already exist. Resignation (employee-initiated, written notice) and termination (employer-initiated, just or authorized cause) differ in what final pay includes. The 30-day written notice for resignation is from my knowledge **[verify]**. |

### Statutory figures checked (secondary sources only)

- **SSS:** 15% of monthly salary credit (employer 10%, employee 5%), MSC ₱5,000 to ₱35,000, plus an employer-only EC of ₱10 or ₱30.
- **PhilHealth:** 5% of basic monthly salary split equally, floor ₱10,000, ceiling ₱100,000. One source says no 2026 change had been issued by late September 2026.
- **Pag-IBIG:** 2% of monthly fund salary, capped at ₱10,000 (maximum ₱200 each).
- These match the template in `ph-statutory-2025.ts`, but come from calculator and vendor sites. **Phase 6 still requires the official circulars before the figures are relied on for pay.**
- Holiday and overtime multipliers in the attendance plan §5 item 10 match DOLE holiday advisories as reported (regular holiday 200%, special day 130%, special day on a rest day 150%, overtime adds 30% of that day's hourly rate). **Night-differential stacking and the unworked regular-holiday rule were not in the sources [verify].**

### What was not verified

The BIR annual table and the exact PD 851 base exclusions were not confirmed from an official
or secondary source in this pass (the ₱90,000 exemption is deferred, so its figure no longer matters yet) (the first BIR search returned only US IRS pages). Gates B and C stay mandatory.

## 6. Definition of done

- Phases 1–7 merged with every gate green, and e2e run for payroll.
- A hand-calculated, article-cited test for the 13th month, the year-end true-up and the final pay.
- A resigned employee shows as Resigned (not Terminated) on the profile, roster and audit log.
- Every released run and old period reproduces to the centavo.
- Statutory figures verified and recorded, or the unverified ones named in the compliance file.
- Knowledge files, ADRs and `ARCHITECTURE.md` updated; gaps B1, B7, the exclusion item and the deadline mismatch resolved or restated.

---

## Appendix: per-phase designs

The three designs below were separate files (`payroll-phase-3-13th-month.md`, `payroll-phase-4-year-end-tax.md`, `payroll-phase-5-final-settlement.md`) until 2026-11-15. They are the detailed designs behind Phases 3, 4 and 5 above.

---

## Appendix A: Phase 3 design: 13th-month run (Gate B draft)

**Status:** Gate B approved 2026-11-14 (owner): build on this base; December is estimated, then trued up in January.
Built 2026-11-14 (uncommitted at the time of writing): `engine/thirteenth-month.ts`, `thirteenth-month-compute.ts`,
`thirteenth-month-ledger.ts`, `thirteenth-month-report.ts`, `PayrollRunService.prepareThirteenthMonth` and
`addThirteenthMonthTrueUp`, the "13th month" button on Payroll runs and the true-up button on January drafts. The final
settlement now reads "already paid" from the same ledger. Legal check of the base and the DOLE fields still open (gaps B24). Parent plan: the plan above Phase 3.

### Shape

- **Run type `thirteenth_month`** (Phase 2), one per calendar year per scope. Period = Jan 1 – Dec 31.
  Same lifecycle and permissions as a regular run (prepare `payroll-runs.create`, submit, approve, release).
- **Due date is policy data:** new optional `PayrollPolicy.thirteenthMonthPayBy` (month-day, default `12-24`).
  Prepare warns (not blocks) when the pay date is after it.
- **Who is paid:** every employee with basic pay in an approved or released **regular** run whose period ends in
  the year. Managerial staff included (company policy, not PD 851 coverage; say so in the ADR).
- **Base:** sum of the `basic`, `absences` and `tardiness` earning lines from those records. These lines are
  already net of unpaid absence and tardiness, and they already exclude overtime, premiums, allowances and
  adjustments (those are separate lines). This is the same base the final settlement uses today
  (`final-settlement-service.ts`, `BASIC_CODES`); it moves into one shared function used by both.
- **Amount** = `roundMoney(base ÷ thirteenthMonthDivisor − already paid)`, floored at zero.
  **Already paid** = `thirteenth_month` adjustments in regular runs that year + the `thirteenth_month` line of
  any approved or disbursed final settlement that year. An employee whose final settlement covered it gets 0 and is
  listed as excluded, with the reason.
- **Record:** one earning line `thirteenth_month`, **non-taxable** (today's behavior; the ₱90,000 cap is deferred,
  risk recorded), no SSS/PhilHealth/Pag-IBIG, no withholding, no other deductions. Net = amount.
- **Snapshot on the record:** base earned, divisor, already paid, months with pay, and the ids of the source runs, so
  the record reproduces (§46).
- **Report:** XLSX/CSV export with the data for DOLE's annual 13th-month report (employee, base, amount, paid on).

### Hand-worked examples (monthly policy: 261 workdays/year, 8 h/day, divisor 12)

Engine rounding: daily rate = round(monthly × 12 ÷ 261); hourly = round(daily ÷ 8); each line rounded.

| | A: full year | B: hired mid-year, raise in Nov | C: resigned Jun 30 |
|---|---|---|---|
| Pay terms | ₱30,000/month all year | ₱24,000/month from Aug 17 (Mon); ₱26,000 from Nov 1 | ₱650/day (daily-rated) |
| Basic lines | 12 × 30,000 = 360,000.00 | Aug: 11 of the month's workdays × 1,103.45 = 12,137.95; Sep–Oct 2 × 24,000; Nov–Dec 2 × 26,000 → 112,137.95 | 126 days paid (129 weekdays Jan–Jun, 3 unpaid absences) × 650 = 81,900.00 |
| Absences | 2 days × 1,379.31 = −2,758.62 | none | (daily-rated: unpaid days are simply not paid) |
| Tardiness | 60 min × 172.41 ÷ 60 = −172.41 | none | none |
| Excluded (not in base) | ₱5,000 overtime, ₱1,500/month rice allowance | none | none |
| **Base** | **357,068.97** | **112,137.95** | **81,900.00** |
| **13th month** (÷ 12) | **29,755.75** | **9,344.83** | **6,825.00**, paid in final pay; the December run lists C as excluded ("paid in final settlement") |

### For the owner to confirm at Gate B

1. The base above against PD 851 and its implementing rules: "basic salary" excludes overtime, premiums, night
   differential, holiday pay and allowances not integrated into the basic salary; unpaid absences reduce it.
   **Not verified against the official text in this pass.**
2. December's last cutoff: **decided** (owner, 2026-11-14): estimate the unpaid rest of the year at current terms (full
   attendance, by the policy's pay periods), then true up in January's first regular run as a 13th-month adjustment tagged
   with the year it belongs to (`PayrollAdjustment.thirteenthMonthYear`), for HR to approve with that run.
3. The DOLE report due date (January 15) and its required fields.

---

## Appendix B: Phase 4 design: year-end tax and Form 2316 data (Gate C draft)

> **Box numbers corrected 2026-11-15:** the numbers below are the Gate C draft's, two higher than the official BIR Form 2316 (January 2018 ENCS). The template now uses the form's own: non-taxable items 27–35 (13th month 32), taxable 37–49 (basic 37, taxable 13th month 46). Read each number here as two lower. Gaps B25.

**Status:** Gate C approved as drafted, 2026-11-14 (owner). The [verify] marks stay open as legal checks (gaps file).
Decisions:
- Q2: the employer's BIR details live on the organization.
- Q3: the ₱90,000 cap is applied at year-end, as rule data.
- Q6: the annual base is the true annual sum.
- Q4 (true-up year) and Q5 (allowance boxes) take the defaults: the year the true-up is for, and the default allowance map. Parent plan: the plan above
Phase 4 and §5 item 3.

**How to read the source marks.**
- **[verify]**: from my knowledge of BIR Form 2316 (January 2018 version, RR 11-2018). Not checked against the official
  form or issuance in this pass.
- **Have**: the field exists in the system today.
- **New**: a field this phase adds.

Item numbers are the form's box numbers as I remember them. Gate C means checking every line against the current form
on bir.gov.ph before anything is built.

### Shape

- **Run type `year_end_adjustment`** (Gate A): one per calendar year per scope.
  - Same lifecycle and permissions as a regular run.
  - It can be prepared only after every regular run whose period ends in the year is approved or released (the same
    guard as the 13th-month true-up).
  - The pay date is HR's choice: the last December pay, or January for a refund **[verify]**.
- **One record per employee**, with one line:
  - **Under-withheld:** a `year_end_tax` **deduction**, labelled "Withholding tax YYYY (year-end)".
  - **Over-withheld:** a non-taxable **earning**, labelled "Tax refund YYYY".
  - Nothing else: no contributions and no other deductions.
  - Employees with no difference are listed with ₱0.00 so the reconciliation is complete.
  - HR approves the run. Nothing is applied silently.
- **Snapshot on the record** (§46):
  - every annualization figure in the formula below;
  - the rule version id used;
  - the ids of the source runs;
  - the previous-employer input id.
- **Who is in it:** employees with an approved or released regular record in the year who are still employed on
  December 31.
  - Separated employees are annualized in their final settlement (Phase 5), so this run lists them as excluded with
    that reason.
  - They still appear in the Form 2316 export.
- **Exports**, all audited like `auditExport`:
  1. the reconciliation report;
  2. the Form 2316 data, one row per employee;
  3. the BIR Annex F list of employees qualified for substituted filing.
  - A printable 2316 stays a follow-up.

### Annualization (RR 11-2018, the employer's December duty [verify])

```
benefits excess   = max(0, Σ non-taxable 13th-month and bonus lines (incl. the 13th-month run) − benefits cap)
                    (cap is rule data; Q3)
present taxable   = max(0, Σ taxable earning lines − Σ employee contributions + benefits excess), over the year's
                    approved/released regular runs (true annual sum, not Σ record.taxableIncome; Q6)
gross taxable     = present taxable + previous-employer taxable (new input)
annual tax due    = roundMoney(progressive tax on gross taxable, using the rule version's ANNUAL table)
withheld          = Σ record.tax (present) + previous-employer tax withheld
difference        = annual tax due − withheld      > 0 → collect   < 0 → refund   0 → none
```

- **Minimum wage earners:** tax due 0, so any amount withheld is refunded. This only happens if the flag changed
  mid-year.
- **Annual table:** today a rule version holds weekly, semi-monthly and monthly tables only.
  - It needs a new `annual` entry. Rule versions are never edited in place, so HR adds a new version with it.
  - The starter template gets the TRAIN annual brackets (2023 onward):
    - 0% up to ₱250,000;
    - 15% of the excess over ₱250,000;
    - ₱22,500 + 20% over ₱400,000;
    - ₱102,500 + 25% over ₱800,000;
    - ₱402,500 + 30% over ₱2,000,000;
    - ₱2,202,500 + 35% over ₱8,000,000.
  - These are in the compliance file, from secondary sources **[verify]**.
  - The year uses the rule version in force on December 31 for the scope.
  - If that version has no annual table, prepare refuses: "Add the annual tax table to a new rule version first."
- **Settlement deadlines:**
  - Collect from the December pay; any balance by January 25 of the next year **[verify]**.
  - Refund by January 25 **[verify]**.
  - These are guidance on the run, not a block.

### Previous employer (new, per employee and year)

`PriorEmployment` is entered by HR from the previous employer's 2316. It holds:

- year;
- employer TIN, name, registered address, ZIP;
- period from and to;
- taxable compensation;
- non-taxable compensation;
- tax withheld;
- "concurrent employer" (yes/no).

It is audited, editable only until the year-end run of that year is approved, and shown on the employee's payroll
tab. One or more entries mean the employee **had two or more employers**: they are flagged and left off Annex F.

### Form 2316 field list

#### Part I: Employee

| Box | Field | Source |
|---|---|---|
| 1 | For the year | run year |
| 2 | Period from / to (MM/DD) | first and last day employed in the year (employment dates, clamped) |
| 3 | TIN | **Have:** `Person.tinNumber` (free text; validate as 9 or 12 digits) |
| 4 | Name (last, first, middle) | **Have:** `Person` name fields |
| 5 | RDO code | ~~**New:** `Person.rdoCode`~~ **Removed 2026-11-16** (owner: not relevant to the employee information kept); the export has no such column now |
| 6, 6A | Registered address, ZIP | **Have:** `Person.address` (one string). ~~**New:** `Person.zipCode`~~ **Removed 2026-11-16** with the RDO; 6A is no longer exported |
| 6B–6D | Local home address, ZIP, foreign address | **Have, partly:** reuse `address`; foreign address not needed for now **[ask]** |
| 7 | Date of birth | **Have:** `Person.birthDate` |
| 8 | Contact number | **Have:** `Person.phone` |
| 9, 10 | Statutory minimum wage per day and per month (MWE only) | **Have:** `Compensation` rate when `minimumWageEarner` (the monthly figure uses the policy's days per year ÷ 12) |
| 11 | Minimum wage earner | **Have:** `Compensation.minimumWageEarner` (any MWE period in the year **[verify how a mixed year is shown]**) |

#### Part II: Present employer

| Box | Field | Source |
|---|---|---|
| 12 | TIN | **New:** `Organization.tax.tin` |
| 13 | Employer name | **Have:** `Organization.name` (**New:** optional `Organization.tax.registeredName` when the BIR name differs) |
| 14, 14A | Registered address, ZIP | **New:** `Organization.tax.registeredAddress`, `zipCode` |
| 15 | Main or secondary employer | **New:** derived. Secondary when the prior-employment entry is marked concurrent **[verify]** |

#### Part III: Previous employer(s)

Boxes 16–18A: TIN, name, address and ZIP, from `PriorEmployment`. The form has one block, so the export lists the
first and adds a column with the rest.

#### Part IV-A: Summary

| Box | Field | Formula |
|---|---|---|
| 19 | Gross compensation, present employer | box 38 + box 52 |
| 20 | Less non-taxable/exempt, present | box 38 |
| 21 | Taxable, present | box 52 (equals present taxable above) |
| 22 | Add taxable, previous employer | `PriorEmployment` |
| 23 | Gross taxable compensation | 21 + 22 |
| 24 | Tax due | annual tax due |
| 25A, 25B | Tax withheld, present / previous | Σ `record.tax` + the year-end line / `PriorEmployment` |
| 26 | Total withheld as adjusted | 25A + 25B, after the year-end adjustment |
| 27 | 5% tax credit (PERA) | 0. Not supported, stated in the export |
| 28 | Total taxes withheld | 26 + 27 |

#### Part IV-B: Details from the present employer (which pay line goes to which box)

The mapping is **rule data**: a new `form2316Boxes` list on the rule version (box ← earning codes or adjustment
categories, with an MWE switch). It is not code, because BIR renumbers forms.

Proposed starting map:

| Box | Field | Pay lines |
|---|---|---|
| 29 | Basic salary (incl. MWE's statutory minimum wage, or basic ≤ ₱250,000 **[verify]**) | MWE: `basic`, `absences`, `tardiness` |
| 30–33 | Holiday pay, overtime, night shift differential, hazard pay (MWE only) | MWE: `holiday_pay`, `rest_day_pay` **[ask: 30 or 31]**, `overtime`, `night_differential`, `hazard_pay` |
| 34 | 13th month pay and other benefits (exempt up to ₱90,000) | non-taxable `thirteenth_month` and `bonus` lines |
| 35 | De minimis benefits | non-taxable `allowance` lines, `de_minimis` |
| 36 | SSS, GSIS, PhilHealth, Pag-IBIG contributions and union dues (employee share) | employee contributions |
| 37 | Salaries and other forms of compensation (non-taxable) | any other non-taxable earning |
| 38 | Total non-taxable | Σ 29–37 |
| 39 | Basic salary (taxable) | non-MWE: `basic`, `absences`, `tardiness` |
| 40–43 | Representation, transportation, COLA, fixed housing allowance | none by default (allowances are free-named; HR maps by name later **[ask]**) |
| 44 | Others (taxable regular) | taxable `allowance` lines |
| 45–47 | Commission, profit sharing, fees | none by default |
| 48 | Taxable 13th month and other benefits | taxable `thirteenth_month` and `bonus` lines |
| 49, 50 | Hazard pay, overtime pay | non-MWE: `hazard_pay`; `overtime`, `holiday_pay`, `rest_day_pay`, `night_differential` **[ask]** |
| 51 | Others (taxable supplementary) | `retro_pay`, `other_earning`, any other taxable earning |
| 52 | Total taxable | Σ 39–51, less box 36 **[verify: whether contributions come off 39 or are shown only in 36]** |

**Not compensation, never on the form:**
- `reimbursement`;
- every deduction other than contributions and tax (loans, cash advances);
- the "Tax refund" line itself.

**Cap at year-end (Q3):** box 34 holds non-taxable 13th-month and bonus pay up to the cap. Any excess moves to box 48
and is taxed in the annualization.

**Check on export:** box 52 must equal present taxable from the annualization. Any difference is shown on the export
as a warning, never hidden.

#### Annex F: employees qualified for substituted filing [verify columns]

The columns are: sequence, TIN, last name, first name, middle name.

An employee qualifies when all of these are true:
- they were with this employer only, for the whole year they were employed (no `PriorEmployment` entry);
- they are on the year-end run;
- annual tax due equals tax withheld after the year-end adjustment.

HR can exclude an employee with a reason (for example, other income it doesn't know about). The exclusion is recorded
in the run's history.

### Hand-worked examples (semi-monthly policy, contributions every cutoff)

| | A: full year, no prior employer | B: hired Jul 1, prior employer Jan–Jun | C: minimum wage earner |
|---|---|---|---|
| Pay terms | ₱30,000/month | ₱40,000/month; prior 2316: taxable ₱180,000, tax withheld ₱0 | ₱650/day, MWE |
| Contributions/month | SSS 1,500 + PhilHealth 750 + Pag-IBIG 200 = 2,450 | 1,750 + 1,000 + 200 = 2,950 | (per table) |
| Per-cutoff taxable | 15,000 − 1,225 = 13,775.00 | 20,000 − 1,475 = 18,525.00 | n/a |
| Per-cutoff tax | 15% × (13,775 − 10,416.67) = 503.75 | 937.50 + 20% × (18,525 − 16,666.67) = 1,309.17 | 0 |
| Present taxable (year) | 360,000 − 29,400 = 330,600.00 | 240,000 − 17,700 = 222,300.00 | 0 (all in boxes 29 and 36) |
| Gross taxable | 330,600.00 | 222,300 + 180,000 = 402,300.00 | 0 |
| Annual tax due | 15% × 80,600 = 12,090.00 | 22,500 + 20% × 2,300 = 22,960.00 | 0 |
| Withheld | 24 × 503.75 = 12,090.00 | 12 × 1,309.17 = 15,710.04 + 0 | 0 |
| **Year-end line** | **none** | **collect 7,249.96** | **none** |
| Annex F | qualifies | no (two employers) | qualifies |

Example B shows why the prior-employer input matters. Without it, the present employer alone would annualize ₱222,300
(below ₱250,000), find ₱0 due and refund ₱15,710.04 wrongly.

### Questions for the owner at Gate C

1. **Check against the current BIR forms:**
   - the 2316 box list and numbering above;
   - the Annex F columns;
   - the annual table;
   - the January 25 deadlines.
2. **Where the employer's TIN, RDO and address live.** Proposed: on the organization, as one BIR employer. Ask if any
   project is a separate BIR-registered employer.
3. **The ₱90,000 cap at year-end.** It was deferred for per-period pay. Annualization reads every 13th-month and
   bonus line anyway, so it could apply the cap here at almost no cost: any excess becomes taxable and is collected in
   the year-end line, with the cap stored as rule data. **Recommended**, but it reverses the Phase 3 deferral, so it
   is your call.
4. **Which year a January 13th-month true-up counts for on the 2316:** the year it is for (`thirteenthMonthYear`) or
   the year it is paid. It is non-taxable either way; this only moves box 34. **[verify]**
5. **The allowance mapping:** default as above (non-taxable to box 35, taxable to box 44), with HR mapping named
   allowances to boxes 40–43 later. Or should the allowance form get a 2316 box now?
6. **Negative per-period taxable** (a cutoff with more contributions than taxable pay) is floored at 0 today, so the
   difference is lost.
   - The annual figure could instead use the true annual sum (taxable earnings − contributions).
   - **Recommended: true annual sum.** It is what the form's boxes add up to.

---

## Appendix C: Phase 5 design: final settlement completed (Gate D draft)

**Status:** draft for Gate D, 2026-11-14. Nothing built. Owner's answers, 2026-11-14:
- Q2: plain SHA-256.
- Q3: the approver only has to differ from the preparer (ADR-032 as written).
- Q4: warnings need a recorded "I've checked these" tick at approve.
- Q5: Phase 5a slice 2 is built with Phase 5.

Q1 (the design as a whole) was approved 2026-11-14 ("go ahead").

Built 2026-11-14:
- `settlement-statutory.ts`, `final-pay-checks.ts`, `settlement-hash.ts`, `separation-status.ts`;
- the reworked `final-settlement-service.ts`, and the settlement page's checks, warning confirmation and document picker;
- the dashboard's deadline source.

Tests: `tests/domains/final-settlement/final-pay-phase-5.test.ts` (the Carla example to the centavo, plus the end-to-end
flow). Follow-ups are recorded in the gaps file (B25, B26). Parent plan: the plan above
Phase 5 and §5 items 5–6; ADR-032; gap list in [domains/final-settlement.md](../domains/final-settlement.md).

**Where Phase 5a stands (read 2026-11-14):**
- **Slice 1 (End Employment dialog) is done** (other session, commit `87efd87`). It sends status, date and note, and
  includes edit-ending and reinstate (ADR-055).
- **Slice 2 (separation type → employment status mapping) is not done:** no `employmentStatusCode` exists yet.
- Slices 3–4 are not done. Slice 4 is check V7 below.

**Marks:**
- **[verify]**: from my knowledge or secondary sources, not the official text.
- **[ask]**: a choice for you.

### 1. The final run (closes "disburse creates the `final` run")

Disburse runs in the **same transaction** that records the payment and closes the clearance (ADR-041). It creates a
`PayrollRun`:

| Field | Value |
|---|---|
| `runType` | `final` (Phase 2) |
| `employeeId` | the employee (the overlap guard already blocks a second final run for the same person) |
| `projectId` | the employee's project on the last working day |
| `payPeriodStart` / `payPeriodEnd` | the salary-balance period (day after paid-through → last working day), or the last working day alone when there is no balance |
| `payDate` | the payment date entered at disburse |
| `policyId` / `ruleVersionId` | those in force on the last working day |
| `status` | `released` directly. It was already prepared, reviewed and approved as a settlement. History notes "Released from final settlement FS-…". |
| `finalSettlementId` | **new** back-link; the settlement gets `payrollRunId` |

**One `PayrollRecord`**, with the settlement's lines mapped to the record's line types:

| Settlement line | Record line | Taxable |
|---|---|---|
| Salary balance | earning `basic` | yes |
| Leave encashment | earning `leave_encashment` | up to the de minimis limit no, beyond it yes (§3) |
| Pro-rated 13th month | earning `thirteenth_month` | no (the ₱90,000 cap is applied in the tax true-up, as at year-end) |
| Tax refund (new, §3) | earning `year_end_tax_refund` | no |
| Manual earning | earning `manual` | **HR picks taxable or not** (new flag) |
| Contributions still due for the month (new, §3) | contribution lines | — |
| Tax still due (new, §3) | `tax` | — |
| Accountability, manual deduction | deductions | — |

The record also carries a **`finalSettlement` snapshot**: settlement id, version, hash, and the tax true-up figures.
Payslip, register export, audit and the Form 2316 export then work as for any run.

**Double-pay guards (new):**
- Regular runs **skip the days a final run already paid**: the employee is listed as excluded with "Paid in final pay
  FS-… (to Oct 21)".
- A regular run that is draft or submitted and covers the salary-balance days **blocks the settlement** (V8): approve or
  cancel it first, so the paid-through date can't move under the settlement.

### 2. Tamper evidence (the hash)

- **On approve:** compute **SHA-256** over a canonical JSON (sorted keys, amounts rounded to the centavo) of:
  - `version`, `employeeId`, `clearanceCaseId`;
  - `lines`, `totals`;
  - `inputs`, the full stored inputs object;
  - `manualLines` (id, direction, label, amount, reason, taxable, attachment id).
- **Store on the settlement:** `approval { hash, version, at, by }`.
- **On disburse:** recompute the hash from the stored document.
  - If it doesn't match, block disburse with "This settlement changed after approval", and write an audit entry
    `final-settlement.hash-mismatch`.
  - If it matches, copy the hash to the final run's record.
- No secret key. This detects edits made outside the app's own workflow. Anyone with database write access could
  recompute the hash, which ADR-032 accepts **[ask if you want a keyed HMAC instead; it needs a secret in the
  environment]**.

### 3. Statutory pieces: tax true-up and contributions (same engine, no copies)

- **Contributions:** the month of the last working day gets that month's full employee share, minus what regular runs
  already deducted that month. It uses `computeMonthlyContributionExact` and the rule version's tables, the same call
  `computeEmployeePay` uses.
  - Like regular payroll, the base is the pay terms' monthly basic, not the month's actual earnings **[verify for a
    partial last month]**.
  - Employer shares are recorded on the record, not deducted.
- **Tax true-up:** the Phase 4 annualization for the year, extended with this settlement's lines:
  1. Take `employeeYears(...)` and add the settlement's lines and contributions as extra pay lines.
  2. Run `annualizeEmployeeYear(...)`, which applies the box map and the ₱90,000 cap.
  3. The difference becomes a "Tax refund" earning (over-withheld) or a "Withholding tax" deduction (under-withheld).
  4. The tax true-up also makes the Form 2316 figures complete for a separated employee, which the year-end run
     deliberately leaves to final pay.
- **Leave encashment:** monetized unused vacation leave is de minimis up to **10 days a year** (RR 11-2018 as I recall
  **[verify]**); the excess is taxable.
  - The limit becomes rule-version data (`deMinimisLeaveDays`, template 10).
  - The 2316 box map gets a `leave_encashment` entry.

### 4. Variance checks (as data)

The checks run on prepare, recompute, approve and disburse. They are shown on the settlement page and in the history.

- **Blocking** checks stop submit, approve and disburse.
- **Warnings** need the approver to tick "I've checked these", which is recorded.
- Severity and thresholds live on **`PayrollPolicy.finalPayChecks`**, with the defaults below, so HR can tune them
  without code.

| # | Check | Default | Fires when |
|---|---|---|---|
| V1 | Negative net pay | blocking | net < 0 |
| V2 | Leave over the cap | warning | encashed days of a type > that type's yearly entitlement, or > the de minimis limit (shows the taxable part) |
| V3 | 13th month already paid / pending | warning; **blocking** if pending | a 13th-month run or advances already paid this year (shows how much), or a 13th-month run for the year still draft/submitted (could pay it twice) |
| V4 | Recent pay change | warning | pay terms changed within **60 days** (policy data) before the last working day |
| V5 | Missing government IDs | warning | SSS, PhilHealth, Pag-IBIG or TIN missing on the person |
| V6 | Tax true-up | warning | the true-up is not zero (shows refund or collection) |
| V7 | Employment not ended | **blocking** | the employment is still active, or its end date ≠ the last working day (5a slice 4) |
| V8 | Unfinished regular payroll | **blocking** | a draft/submitted regular run covers any salary-balance day |
| V9 | Inputs changed since approval | warning at disburse | recomputing the inputs from live records now gives something different from the frozen inputs (lists which fields) |

### 5. Segregation of duties

- **Review:** refused to anyone on a `prepared` or `recomputed` history entry (today only approve checks this).
- **Approve:** refused to the preparer, as today. Also refused to the reviewer **[ask: ADR-032 only names the preparer;
  three different people may be too strict for a small HR team]**.
- The audit metadata records `selfReviewed: false` and `selfApproved: false`, as payroll runs do.

### 6. Manual lines: reason and attachment

- A manual line needs a reason (as today) **and** a supporting document.
  - The document is an `EmployeeDocument` of that employee, uploaded through the existing document storage, so no new
    storage.
  - The manual-line form gets an upload (or a pick from the employee's documents), and the line stores `documentId`.
- A manual **earning** also gets a **taxable** switch, default taxable. The tax true-up needs it.
- Existing manual lines without an attachment can't move a draft forward until one is added. Lines on approved or
  disbursed settlements are untouched.

### 7. One deadline source

- The dashboard's compliance risk reads `PayrollPolicy.finalPayDeadlineDays` for the employee's scope on the last
  working day.
- It falls back to `Organization.compliance.finalPayDays` only when no policy applies. The old field stays.
- The 30-day default is from DOLE Labor Advisory 06-2020 as reported **[verify]**. Per §5 item 5, it counts from the
  separation date and is not paused by clearance.

### 8. Worked example (monthly policy: semi-monthly, 261 workdays, divisor 12, contributions every cutoff)

**Carla:** ₱25,000/month. She resigns with her last working day on **Wed, Oct 21, 2026**.
- Payroll is approved through Oct 15.
- 3 convertible vacation-leave days are left.
- She hasn't returned a laptop charger, flagged in clearance at ₱1,500.
- No 13th month has been paid yet.
- Daily rate = round(25,000 × 12 ÷ 261) = **1,149.43**.

| Line | Working | Amount |
|---|---|---|
| Salary balance | 4 workdays (Oct 16, 19, 20, 21) × 1,149.43 | 4,597.72 |
| Leave encashment | 3 days × 1,149.43 (within 10 days: non-taxable) | 3,448.29 |
| 13th month | (237,500 earned Jan 1–Oct 15 + 4,597.72) ÷ 12 − 0 | 20,174.81 |
| Contributions still due | October: SSS 1,250 + PhilHealth 625 + Pag-IBIG 200 = 2,075; already deducted Oct 1–15: 1,037.50 | −1,037.50 |
| Tax true-up | taxable for the year = 19 × 11,462.50 (= 217,787.50) + 4,597.72 − 1,037.50 = 221,347.72 → tax due 0; withheld 19 × 156.87 = 2,980.53 | **+2,980.53 refund** |
| Accountability | laptop charger | −1,500.00 |
| **Net final pay** | | **28,663.85** |

**Checks:**
- V4 doesn't fire (no recent pay change).
- V6 warns: "Tax refund ₱2,980.53".
- V3 warns "No 13th month paid yet this year; paid here in full".
- If an Oct 16–31 regular run is still a draft, V8 **blocks** until it is approved or cancelled. If approved, it is the
  run that pays those 4 days and the salary balance drops to 0. If cancelled, the settlement pays them.
- On disburse, the run `PR-…` (type Final, Oct 16–21, released) holds one record with exactly these lines.

### Questions for the owner at Gate D

1. **Confirm the design above:**
   - the final run is created as `released` on disburse;
   - the hash fields;
   - the check list V1–V9 with its defaults;
   - manual lines need an attachment.
2. **Hash:** plain SHA-256 (recommended; detects edits made outside the workflow) or a keyed HMAC (also resists
   someone who can rewrite the database; needs a secret in the environment).
3. **Approver ≠ reviewer** as well as ≠ preparer: yes, or only the preparer (ADR-032 as written)?
4. **Warnings at approve:** a recorded "I've checked these" tick (recommended), or just shown?
5. **Phase 5a slice 2** (the separation type sets the employment status): build it as part of Phase 5, or leave it
   for later? V7 works without it, by comparing the dates.
6. Legal checks still open:
   - contribution base for the partial last month;
   - the 10-day de minimis leave limit;
   - the DOLE 30-day rule and when it starts.
