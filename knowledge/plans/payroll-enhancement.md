# Plan: Payroll enhancement (compliance, run integrity, final pay)

**For:** an implementing agent (Opus). **Written:** 2026-11-14 against commit `6587050`.
**Status:** plan only. Nothing here is implemented. Paths come from the `knowledge/` base; re-check them in
the source before relying on them (line numbers drift).
**Companion plan:** [attendance-engine-enhancement.md](./attendance-engine-enhancement.md). This plan
**starts after that plan's Phases 1–5 are merged.** Overtime, rest-day, holiday and night-differential pay
are computed there and are **not** repeated here.

## 0. How to work

1. Read, in order: `knowledge/README.md`, `overview.md`, `layers.md`, `CHANGE_PROTOCOL.md`,
   `domains/payroll.md`, `domains/payroll-engine.md`, `domains/final-settlement.md`,
   `philippine-payroll-compliance.md`, `known-gaps-and-mismatches.md`, `cross-cutting.md` (money, dates, audit),
   `testing.md`; then `docs/ENGINEERING.md` §§ 27, 28, 33, 35, 46, 52, 53, 58–60 and ADR-011, 014, 029, 032, 041.
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
3. **Scheduled end (resignation with notice).** A resignation usually takes effect after a notice period. Keep the employee
   active until the effective date, and show "ending on <date>". Decide whether a daily job or a read-time check applies the
   status (the cron pattern already exists). Until built, slice 1 should tell HR to end the employment on the last working day.
4. **Hand-off to final pay.** Phase 5's variance checks add "employment not ended or not yet effective", and the settlement reads
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

- **Tables:** verify SSS, PhilHealth, Pag-IBIG and withholding figures against the official sources listed in
  `philippine-payroll-compliance.md` §6. Publish corrections as a **new rule version** (new `versionNumber`,
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

- Payslip and register show every new line (13th month, year-end adjustment, final lines) with their taxable flags.
- Register export columns follow the existing `roundMoney` / `sumMoney` rules, so totals add up.
- Keep `PageHeader`, `loading.tsx`, mobile layout (§41). Add UI tests, since payroll pages have none today.

### Phase 8: Verify and document

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
