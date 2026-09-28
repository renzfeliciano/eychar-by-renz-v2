# ADR-029: Payroll rebuilt around the real payroll cycle

## Status

Accepted. Supersedes ADR-014's run lifecycle, compensation and contribution model. ADR-014's
"compute everything in memory, then write" rule and its reasons for not using a Mongo transaction
still apply.

## Context

A review of the Phase 7 payroll found problems that would produce wrong pay:

- The same period could be run twice.
- Resigned staff were included, and one employee without a salary blocked the whole run.
- Tax was taken on gross pay.
- Contributions were flat rates with no employer share.
- Amounts weren't rounded to centavos, and nothing stopped a negative net pay.
- Only monthly-rated pay existed.

The process was also a single step (generate, then approve), with no draft, no return, cancel or
release, no pay date, no payslips and no register.

There was no payroll data yet, so the models were rebuilt instead of migrated. The user chose each
option:

- **Pay basis:** both monthly- and daily-rated employees.
- **Approval:** Draft → Submitted → Approved (or Returned) → Released. The preparer may also
  approve; this is allowed and recorded, not blocked.
- **"Project wide, by a set date":** all three meanings:
  - per-project runs;
  - drafts prepared automatically on a schedule;
  - bulk pay changes effective on a date.
- **Government deductions:** PH-accurate tables, editable as data.

## Decision

### Calculation engine: pure functions (`src/domains/payroll/engine/`)

`computeEmployeePay()` turns pay terms, policy, rules, an attendance summary and adjustments into a
payslip. Every line is rounded to centavos (half away from zero) as it's produced, and totals are
sums of rounded lines.

- **Monthly-rated pay:**
  - Basic pay is the period's share of the monthly rate.
  - Absences and tardiness come off at the derived daily and hourly rates. The daily rate is the
    monthly rate × 12 ÷ paid days a year (261 for a 5-day week, 313 for a 6-day week).
  - Someone hired or separated mid-period is paid per eligible workday.
- **Daily-rated pay:** (days worked + paid leave) × the daily rate.
- **Allowances:** per month (split across the month's cutoffs) or per day worked, each taxable or
  not.
- **Contributions:** based on monthly basic pay (a daily rate's monthly equivalent for daily-rated
  staff). They're split across cutoffs, or taken whole on the month's last cutoff, as the policy
  says. Employer shares and SSS EC are stored for remittance.
- **Withholding tax:** applied to taxable earnings less the employee's contributions, using the
  table for the policy's pay frequency. Minimum wage earners are exempt.
- **Other deductions** (loans, cash advances) come off after tax.
- **Warnings on each payslip:**
  - scheduled workdays with no attendance record;
  - rest-day work (to be paid through an adjustment, with the 130% amount suggested);
  - pay terms that changed inside the period;
  - net pay more than 20% different from the employee's last released payroll;
  - negative net pay, which blocks submitting the run.

### Attendance as payroll reads it (`payroll-attendance.ts`)

- Only days the employee was employed with an active-headcount status count.
- On a workday under the payroll policy:
  - "absent" is unpaid;
  - "on_leave" is paid leave;
  - any other status is a day worked;
  - no record at all is "missing", which is reported, never guessed.
- Minutes late count only on "late" days, because attendance already applied the grace period.
  Undertime is any check-out before the standard end.
- Holidays, overtime and night differential are still HR adjustments (ADR-014 decision 1).
  Categories and their usual tax treatment are suggested in `adjustment-categories.ts`.

### Rule versions hold PH tables as data

`PayrollRuleVersion` stores:

- `taxTables`: one bracket table per pay frequency;
- `contributions`: rows that match a salary range and give either fixed amounts or rates on a base
  clamped to a floor and ceiling, plus an employer-only add-on.

One shape covers all three agencies:

- SSS's salary-credit table: fixed amounts per range, with EC as the add-on.
- PhilHealth: a rate with a floor and a ceiling.
- Pag-IBIG: rates by tier, with a ceiling.

The seed creates "Philippines 2025" from `templates/ph-statutory-2025.ts`:

- SSS: 15% on credits of ₱5,000–₱35,000.
- PhilHealth: 5% on ₱10k–₱100k, shared equally.
- Pag-IBIG: capped at ₱10k.
- BIR RR 11-2018 weekly, semi-monthly and monthly tables.

The seed also retires the old example version. Rates change through a new version made in the
table editor. Nothing in code reads the numbers.

### Compensation

- Each row holds `rateType` (monthly or daily), `rate`, named allowances and the minimum wage earner
  flag.
- Rows are calendar-dated and inclusive: a revision closes the current row the day before the new
  one starts, so every day resolves exactly one row.
- **Bulk change:**
  - scope: a project (as assigned on the effective date) or everyone, and optionally one rate type;
  - change: set a rate, raise by an amount or percentage, or raise to a minimum (wage orders);
  - it's always previewed first, HR can untick people, and it's applied as one audited batch of
    dated revisions.

### Runs

- **Scope and numbering:** a run covers the organization or one project, for a period of at most
  31 days, with a pay date. It's numbered `PR-YYYY-NNNN`.
- **Double-pay guard:** a project run overlaps organization-wide runs and runs for the same project.
  An organization-wide run overlaps any run. Cancelled runs free their period.
- **Lifecycle:**
  - A draft can be recomputed freely, and adjustments can be added or removed (each change
    recomputes the run).
  - Submitting recomputes first, and is blocked by blocking issues or an empty run.
  - An approver can approve the run, or return it to draft with a reason.
  - Release records the paid date and payment reference, and locks the run.
  - Cancelling (draft or submitted only) needs a reason. Runs are never deleted.
- **Permissions:** prepare, edit, submit and cancel use `payroll-runs.update`. Approve and return
  use `payroll.approve`. Release uses `payroll.release`.
- **Reproducibility:**
  - Each record stores the inputs that produced it: rate, rates used, the attendance summary and
    the lines.
  - It also stores snapshots of the employee's name and number.
  - The run snapshots the policy and rule version it used. A released run never changes when pay
    terms change later.
- **Outputs:**
  - printable payslips (one per page, with a received-by line);
  - an Excel register (per employee with totals, plus a contributions sheet with employee,
    employer and EC shares);
  - a CSV register.

### Schedules ("by a set date")

- `PayrollSchedule` is a payroll calendar per project or for everyone:
  - semi-monthly cutoffs (1st–15th and 16th–end, 26th–10th and 11th–25th, …), monthly, or weekly;
  - a pay-day offset.
- The day after a cutoff, `prepareDue` prepares that period's draft if none exists for the same
  people.
- It runs from `/api/cron/payroll-schedules` (with `CRON_SECRET`) and whenever the payroll screen
  opens. Failures are recorded on the schedule, not thrown.
- Nothing is submitted, approved or paid automatically.

## Consequences

- No holiday calendar or overtime requests yet, so those premiums are entered as adjustments. The
  payslip suggests amounts, e.g. 125% overtime and 130% rest day. A holiday calendar and OT
  requests are the natural next steps.
- Loans are per-run deductions. A loan ledger that deducts amortizations automatically each run is
  a follow-up.
- Contributions for a partial month use the full monthly base. The 13th-month ₱90k exemption is
  handled by marking the excess taxable. A mid-period rate change uses the new rate for the whole
  period and warns.
- The engine, templates, services, schedules and exports are covered by tests. Each figure in
  `payroll-engine.test.ts` was worked by hand.
