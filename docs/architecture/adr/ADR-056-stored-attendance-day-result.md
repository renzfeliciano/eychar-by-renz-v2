# ADR-056: The stored attendance day result

**Status:** Accepted, 2026-11-14 (attendance engine plan, Phases 2 to 4; GATE 2 approved by the owner).
**Context:** Attendance stored only a check-in, a check-out and a present/late status. Payroll re-derived late and undertime from the policy's start and end times on every compute, ignored the schedule, and could not see overtime, night work, rest days or holidays. Recomputing a period after a schedule or policy change could silently give a different answer (ENGINEERING §27, §28, §46). ADR-027 kept the schedule "reference only".

## Decision

1. **One pure calculation.** `calculateDay` (`src/domains/attendance/day-calc.ts`) turns one day's resolved inputs into whole minutes: scheduled, worked, late, undertime, overtime, night, and night minutes that are also overtime, plus the day type, a separate `restDay` flag and data flags (`missing_checkin`, `missing_checkout`, `crosses_midnight`, `overtime_unapproved`). No I/O, no rates, no thresholds in code: break, rounding block and night window are optional attendance-policy fields with defaults as data (`ATTENDANCE_TIME_RULE_DEFAULTS`).
2. **Expected hours come from the scheduled shift first**, then the attendance policy's standard hours (this changes ADR-027 for worked time; the present/late status still follows the policy, owner decision at GATE 2). Overtime is time after the shift's end plus regular time beyond the payroll policy's daily hours; arriving early is never overtime. Late and undertime count only on ordinary days. Rounding floors to the block.
3. **The result is stored** on the record as an optional `dayResult` subdocument (`buildDayResult`, `src/domains/attendance/day-result.ts`), with what produced it: `policyId` (attendance policies are never edited in place, so the id pins the rules), `scheduleEntryId`, `holidayId`, `payrollPolicyId`, `regularMinutesCap`, `calcVersion` (`DAY_CALC_VERSION`, bumped by hand when the rules change; now 2) and `calculatedAt`. On a holiday it also stores `previousWorkday` (attended / on approved leave), the fact payroll's unworked-holiday rule needs.
4. **When it is computed:** at HR record, at self-service clock-in and clock-out, and on adjust when check-in, check-out or overtime approval changes. Never on read. A notes- or status-only edit does not pick up a later schedule change.
5. **Recalculate is explicit.** `POST /api/attendance/recalculate` (`attendance.recalculate`, its own permission) re-measures up to 62 days, optionally one employee, writes only days whose result changed, skips records edited meanwhile (`updatedAt` guard), and audits each change as `attendance.recalculated` with before and after.
6. **Holidays drive the day type through configuration** (Phase 4): active holidays only; the payroll policy's `holidayDayTypes` maps each holiday type to a day type (defaults `HOLIDAY_DAY_TYPE_DEFAULTS`; "not observed" makes it an ordinary day); a scoped holiday applies only where the employee's project location name or code matches; with two holidays on one day the stronger day type wins (a regular holiday over a special day, owner decision at GATE 3).
7. **Overtime approval** is a field on the record (`overtimeApproved`, `overtimeApprovedBy`, `overtimeApprovedAt`), set through adjust under `attendance.update`.
8. **Older records** are filled by `scripts/backfill-day-results.ts` from stored data only (dry run by default, idempotent, audited). Calendar dates written under the old UTC rule are moved first by `scripts/backfill-attendance-dates.ts`.

## Consequences

- Payroll can read stored, explainable minutes instead of re-deriving them (ADR-057).
- Two notions of "late" exist on shift days until the status follows the shift: the status (policy) and `dayResult.lateMinutes` (shift).
- After a schedule, holiday or policy change for days already recorded, HR must recalculate; nothing changes silently.
- A forgotten `DAY_CALC_VERSION` bump hides which rules produced a result.
- A holiday scope spelled differently from the location name is silently not applied.
