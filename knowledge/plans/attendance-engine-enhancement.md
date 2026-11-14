# Plan: Attendance engine enhancement and payroll integration

**For:** an implementing agent (Opus). **Written:** 2026-11-14 against commit `6587050`.
**Status:** plan only. Nothing here has been implemented. Every file path below comes from the
`knowledge/` base and should be re-checked in the source before you rely on it (line numbers drift).

## 0. How to work

1. Read, in this order: `knowledge/README.md`, `overview.md`, `layers.md`, `CHANGE_PROTOCOL.md`,
   `domains/attendance.md`, `domains/holidays.md`, `domains/payroll.md`, `domains/payroll-engine.md`,
   `philippine-payroll-compliance.md`, `known-gaps-and-mismatches.md`, `testing.md`, then
   `docs/ENGINEERING.md` §§ 22, 26–28, 35, 46, 52, 58–60 and ADR-011, 014, 029, 035, 043, 045.
2. Follow `CHANGE_PROTOCOL.md`: write the brief, run the baseline (`npm run typecheck`, `lint`, `test`),
   work in small additive slices on a branch, never on `main`.
3. **Stop and ask for approval** at the gates marked **GATE** below. This work changes data shape and
   payroll results, so the protocol requires approval.
4. Use the superpowers `brainstorming` skill before Phase 2, and `test-driven-development` for every phase.
5. Constraints that never bend: extend the engine, don't rewrite it (ENGINEERING §52). No rates, multipliers,
   windows or thresholds in code; they are policy data (§2, §28). Everything effective-dated (§27).
   Org and project scope come from the server (§55). Never read or copy `.env.local`.

## 1. Goal

Today the attendance domain records one check-in/check-out per day, and the status (`present`/`late`) is
computed once. Payroll treats overtime, rest-day pay, holiday pay and night differential as numbers HR types in.
After this work:

- Attendance records the **worked time** for each day in a reproducible, effective-dated way: late, undertime,
  overtime and night-differential minutes, plus the day's type (workday, rest day, regular holiday, special day).
- Payroll **computes** the premium pay from that data and the payroll policy, with the same rounding and
  audit rules as today, and no manual double entry.
- Known date bugs are fixed first, because every later number depends on the right calendar day.

Non-goals (separate work): year-end reconciliation and Form 2316, the ₱90,000 13th-month exemption,
regular 13th-month computation in the run, bi-weekly pay frequency, final-pay deadline values.

## 2. Facts the plan stands on (verify before coding)

- One `AttendanceRecord` per employee per day; unique `{organizationId, employeeId, date}`
  (`src/server/db/models/attendance-record.ts`). The `date` is the **UTC** calendar day (`toCalendarDateUtc`).
- Status is computed once in `AttendanceService.record` and the self-service clock-in, using the policy
  resolved for that date (`computeStatus`, `minutesOfDayInAppZone`). `adjust()` does not recompute it.
- `summarizeAttendance` (`src/domains/payroll/payroll-attendance.ts`) reads records for a period: employed days
  only, `workWeekDays` from the policy, `absent` unpaid, `on_leave` paid, anything else worked, no record =
  "missing", work on a non-workday = `restDaysWorked`. Late minutes count on "late" days; undertime is any
  check-out before the standard end.
- `computeEmployeePay` is pure (`src/domains/payroll/engine/compute-pay.ts`). `overtimeMultiplier` (1.25) and
  `restDayMultiplier` (1.3) exist on `PayrollPolicy` but are only used in UI text and a warning.
  Overtime, holiday and night differential are HR adjustments (`adjustment-categories.ts`).
- `Holiday` has a `type` and `status` (`active`/`cancelled`). `isDayOff(type)` is used only by the Schedules UI.
  Holidays drive neither attendance nor pay. A type expresses observance only; pay treatment belongs to payroll
  policy (comment in `holiday-types.ts`).
- Policies resolve Organization → Project, effective-dated by day (`resolve-org-project-policy.ts`).
- Payroll rule: attendance inputs must be snapshotted into the payroll record at compute time, so later
  corrections never silently change a finished payroll (`CHANGE_PROTOCOL.md` worked example, ENGINEERING §28).

## 3. Phases

Each phase ships on its own, passes the full gates, and leaves existing behavior unchanged unless stated.

### Phase 1: Fix the foundations (must come first)

| Item | Problem | Change |
|---|---|---|
| 1a. Manila calendar day (gap B3) | Clock-ins 00:00–08:00 Manila are filed under the previous UTC day, while the schedule and dashboard use the Manila day. | Derive the record's calendar date from the app-zone day (`localDateKey` / `dateKeyToDate` in `src/lib/date-key.ts`, ADR-045), in `record`, self-service check-in, check-out, and `getTodayRecord`. Write a failing test first (clock-in at 02:00 Manila). |
| 1b. Historical records | Existing rows used the UTC day. | Idempotent backfill script with a **dry-run** mode and a report. Recompute `date` from `checkInAt` in the app zone. Detect unique-index collisions and report them; never overwrite or delete. Needs approval (§53). |
| 1c. `adjust()` status | A corrected check-in leaves a stale late/present flag. | Recompute status on `adjust` when times change and the caller did not send `status`, using the policy for the record's date. Audit before/after. |
| 1d. Two notions of "current project" | `dayRoster` uses the latest assignment, `listForOrganization` uses `assignmentsAsOf(date)`. | Make `dayRoster` use `assignmentsAsOf(date)`. |
| 1e. Malformed JSON (gap B2) | `SyntaxError` from `request.json()` returns 500. | Map to 400 in `toErrorResponse`. Small, separate commit. |

**GATE 1:** present the 1b dry-run report on a copy of the data (or a seeded DB) before running it for real.

### Phase 2: Worked-time calculation (pure module, no behavior change yet)

Add `src/domains/attendance/day-calc.ts` (name may change to match siblings): a **pure** function that takes
the resolved inputs and returns a day result. No I/O, same style as `compute-pay.ts`.

Inputs: record (check-in/out instants), the schedule entry or shift for the day (standard start/end, break),
the resolved attendance policy, the holiday on that day (if any), whether it is a rest day, the app zone.

Output (all in minutes, integers): `scheduledMinutes`, `workedMinutes`, `lateMinutes`, `undertimeMinutes`,
`overtimeMinutes`, `nightDiffMinutes`, `dayType` (`workday | rest_day | regular_holiday | special_holiday |
special_working`), and `flags` (e.g. `missing_checkout`, `crosses_midnight`, `overtime_unapproved`).

Rules to settle (see §5 questions): grace period, break deduction, rounding of minutes, overtime start (after
scheduled end or after 8 worked hours), overtime approval, night window (default 22:00–06:00, from policy),
overnight shifts, and what a missing check-out means.

Policy data, not code: extend `AttendancePolicy` with **optional** new fields (grace minutes, break minutes,
overtime rules, night window, rounding). Defaults must reproduce today's results exactly, and old policies
must stay readable (same pattern as `payPremiumsOf` filling older policies). Update the policy create dialog.

Tests: `tests/domains/attendance/day-calc.test.ts` covering normal day, late, undertime, overtime, overnight
shift crossing midnight and the Manila day boundary, night window, holiday, rest day, missing check-out,
and a **characterization test** proving old policies give the same late/present result as before.

### Phase 3: Persist the day result on the record

- Add optional fields to `AttendanceRecord` for the Phase 2 output plus the **policy id/version used** and a
  `calcVersion`. Optional, so existing rows stay valid. No collection rename, no destructive migration.
- Compute once, at `record`, self-service check-out, and `adjust`. Store, don't recompute on read. This keeps
  the existing rule "status is computed once against the policy for that date" and makes results reproducible.
- When a holiday or schedule is added **after** records exist, do not silently rewrite old records. Provide an
  explicit, audited "recalculate" action for HR (permission-gated, per day or range), which writes a new
  audit entry with before/after. Decide who may run it.
- Audit: reuse `attendance.recorded` / `attendance.adjusted`; add `attendance.recalculated`.
- Backfill script for old records: idempotent, dry-run first, calculates only from stored data, never from today's policy.
  Needs approval.

**GATE 2:** review the schema additions, the `calcVersion` scheme, and the recalculation rules before any payroll change.

### Phase 4: Holidays and rest days drive the day type

- Read the holiday calendar in the day calculation: only `status: active`, matching the org and the day.
  Map `Holiday.type` to `dayType` through **configuration**, not a hardcoded switch. Read
  `src/domains/holidays/holiday-types.ts` for the actual type list first. Two options: a mapping on the
  attendance policy, or on the payroll policy (preferred: it is pay treatment, per the comment in `holiday-types.ts`).
- Rest day comes from the schedule entry (`kind: rest`) first, then the policy's workweek.
- Unworked holiday pay (paid when the employee was present or on leave the day before, for regular holidays)
  is a payroll rule. Record the facts needed here (was there attendance the previous workday), and decide the
  rule in Phase 5.
- Holiday permissions still reuse `attendance.*` (gap noted in `holidays.md`). Do not change that here.

### Phase 5: Payroll computes the premiums

Extend, don't rewrite, `computeEmployeePay`.

1. `summarizeAttendance` reads the Phase 3 stored minutes and day types. For records without them (old rows),
   fall back to the current behavior so finished and older periods reproduce exactly.
2. Extend `PayrollPolicy` with **optional, effective-dated** multipliers, defaults matching Philippine law
   (see `philippine-payroll-compliance.md` §4): ordinary overtime, rest-day, rest-day overtime, regular
   holiday, regular holiday overtime, special non-working day, special day on a rest day, night differential,
   and combinations. Keep `payPremiumsOf` filling older policies. Update the policy dialog.
3. Add engine lines: overtime pay, rest-day premium, holiday pay, night differential, each computed from the
   hourly or daily rate (already rounded to centavos), the minutes, and the policy multiplier. Each line is
   rounded as produced and totals use `sumMoney`, like the existing lines. Mark their taxable flags from
   `adjustment-categories.ts`.
4. **No double counting.** HR adjustments in the same categories already exist. Decide the behavior and
   test it: for example a run setting `computePremiums` that, when on, hides or blocks the manual categories
   for that run, with a warning if both are present. Existing runs keep today's behavior.
5. Snapshot the attendance inputs into the payroll record at compute, as the protocol requires, so a later
   attendance correction cannot change a finished run. Record the engine version and the policy ids used.
6. Remove or update the now-misleading `rest_day_work` warning and the UI text in `run-register.tsx`.
7. Warnings as data: add `unapproved_overtime`, `missing_checkout`, and a holiday data warning when a holiday
   falls in the period but the policy has no multiplier for its type.
8. Do not recompute finished runs. Only new runs use the new engine, unless the owner says otherwise (§5).

**GATE 3:** present the premium formulas in a worked-example table (hand-calculated for a real salary) and get them
approved against the Labor Code articles. The compliance file says all figures need verification against
official text. Do that before relying on them.

### Phase 6: Scope, UI and exports

- Project scope (gap B11) and export auditing (gap C8) are **out of this change** (decided 2026-11-14, §5 item 9).
  Do not touch them here. Each gets its own follow-up change.
- UI: show late, undertime, overtime, night minutes and day type on the roster and record dialog (mobile first, §41).
  Add the columns to the attendance export and the payroll register. Keep `PageHeader`, `loading.tsx` and the
  existing dialog patterns (`knowledge/ui-patterns.md`).

### Phase 7: Verify and document

- Full gates: `npm run typecheck`, `lint`, `npm test`, `npm run build`, then run the app and walk the roster,
  clock-in, a payroll run and the payslip. Run `npm run test:e2e` for the clock flow.
- Historical test (§59): an old period computed with the policy in force on that date still gives the same result
  after the policy changes. Authorization test (§60): HR for the org can run payroll, a project-scoped manager cannot run or see
  payroll outside their project. Reproducibility test (§46).
- Update `knowledge/domains/attendance.md`, `payroll-engine.md`, `holidays.md`, `known-gaps-and-mismatches.md`,
  and `philippine-payroll-compliance.md`. Add an ADR for the stored day result and one for premium computation
  (new decisions need an ADR). Update `ARCHITECTURE.md` and its "Known gaps".

## 4. Compatibility and risk

- **Preserved:** existing records, finished payroll runs, existing policies, existing API response shapes
  (new fields are additive and optional), the audit actions already in use.
- **Changed on purpose:** the stored calendar day of early-morning clock-ins (1a/1b), stale status after `adjust` (1c),
  and premium pay for new runs (Phase 5).
- **Highest risks:** the date backfill (index collisions), double-counting premiums against manual adjustments,
  and overnight shifts that cross the Manila day boundary.
- **Rollback:** every phase is additive. Backfill scripts keep a report and never delete. New fields can be
  ignored by older code.

## 5. Questions to settle with the owner before Phase 2

### Decided by the owner, 2026-11-14 (questions 1–5, recommended defaults accepted)

1. **Overtime approval: required.** An approved flag on the record, set by HR. Unapproved overtime is reported
   but not paid, with a warning (`unapproved_overtime`). A full request/approval workflow can come later.
2. **Overtime start: after the scheduled shift end**, capped by the daily hours in the payroll policy.
3. **Grace and rounding: policy fields**, default 0 grace and exact minutes, so nothing changes until HR sets them.
4. **Breaks: a break-minutes field on the shift template**, deducted only when worked time exceeds it.
5. **Night window: 22:00–06:00, read from policy** (not hardcoded). Hours confirmed.

### Decided by the owner, 2026-11-14 (questions 6–11, "follow the recommendations")

Items 6 and 8 had a recommendation in the first draft. For 7, 9, 10 and 11 the first draft gave no concrete
default, so the recommendation below was written when the owner asked for it. The owner accepted all of them.
Items 7 and 10 rest on Labor Code figures that are **not yet verified against official text**: Gate 3 requires that.

6. **Missing check-out:** flag it (`missing_checkout`) and pay nothing for the day until HR adjusts the record.
   No one is paid for unverified time.
7. **Holiday mapping:** read `HOLIDAY_TYPES` in `src/domains/holidays/holiday-types.ts` first, then map in the
   **payroll policy** (configuration, not a switch statement):
   - regular holiday → regular holiday treatment;
   - special non-working day → special treatment;
   - `special_working` → an ordinary day (it is not a day off, per `isDayOff`).
   Unworked-but-paid regular holiday: **in scope for daily-rated employees only**. Paid at the daily rate if the
   employee was present or on paid leave on the previous workday. Monthly-rated pay already includes the regular
   holiday through the 261/313 day factor, so adding it would double count. Confirm this reasoning at Gate 3.
8. **Finished runs:** only new runs use the new engine. Finished runs are never recomputed.
9. **Scope split:** project-scope fixes (B11) and export auditing (C8) are **out of this change**, and each gets its
   own follow-up change. Phase 6 shrinks to the UI columns and the export columns only.
10. **Premium combinations**, as multipliers of the hourly rate, all held in the payroll policy as data
    (the Philippine defaults below are the seed values, from the Labor Code as I know it, to be checked at Gate 3):

    | Day | First 8 hours | Overtime hours |
    |---|---|---|
    | Ordinary day | 100% | 125% |
    | Rest day | 130% | 130% × 130% = 169% |
    | Special non-working day | 130% | 130% × 130% = 169% |
    | Special non-working day on a rest day | 150% | 150% × 130% = 195% |
    | Regular holiday | 200% | 200% × 130% = 260% |
    | Regular holiday on a rest day | 260% | 260% × 130% = 338% |

    **Checked 2026-11-14 against DOLE holiday advisories as reported in the news** (secondary sources): regular holiday
    200%, special non-working day 130% (no work, no pay unless a policy or CBA says otherwise), special day on a rest
    day 150%, and overtime adds 30% of that day's hourly rate. The rows above match. **Not found in the sources, still
    to verify at Gate 3:** how night differential stacks with holiday premiums, and the unworked regular-holiday rule.

    Night differential: add 10% of the **applicable** hourly rate for hours in the night window, so it stacks on
    the multiplier for that day (for example 1.25 × 1.10 on an ordinary-day overtime night hour). Store each
    multiplier as its own policy field, not computed in code, so a different country or rule can change it.
11. **Recalculate permission:** a **new** permission `attendance.recalculate`, added to the seed, held by HR and
    administrators only. It must not reuse `attendance.update`, which shift templates and the holiday calendar
    already share. Enforce it on the server and cover it with an authorization test.

## 6. Definition of done

- Phases 1–5 merged with all gates green and e2e run for the clock flow.
- A worked-example test for each premium, hand-calculated and cited to a Labor Code article.
- Old periods and finished runs reproduce to the centavo.
- Knowledge files, ADRs and `ARCHITECTURE.md` updated, and the gap list shows B3, B2 and the attendance parts of B5 resolved.
