# ADR-064: Scheduled end of employment (resignation with notice)

**Status:** Accepted, 2026-11-15 (payroll plan Phase 5a slices 3–4; owner: active until the date). Extends ADR-055.
**Context:** End employment changed the status at once, so a last working day after today was refused: an employee resigning with 30 days' notice would drop out of current staff, payroll and attendance a month early. HR had to come back on the last working day.

## Decision

1. **A future last day is scheduled, not applied.** `EmploymentService.terminate` with a last day after today stores `Employment.scheduledEnd` (status, last day, note, who, when). Status and `effectiveTo` stay untouched, so the employee is active everywhere and the profile shows "Ending after <date> (<reason>)". `endingHistory` gets `end_scheduled`; the audit action is `employment.end_scheduled`. One schedule at a time.
2. **Applied the day after the last day.** `applyDueScheduledEnds` (idempotent, conditional update) turns each due schedule into an ordinary ending: status, `effectiveTo`, note, `ended` in history credited to whoever scheduled it, audited as `employment.terminated` with `metadata.scheduled`. It runs from a daily cron (`/api/cron/employment-endings`, 00:35 Manila; off without `CRON_SECRET`) and before the profile page loads, so a missed day catches up.
3. **Payroll reads the scheduled last day before it applies** (`employmentLastDay`): a regular or 13th-month run prepared during the notice period doesn't count days after it.
4. **Cancel before it applies** with a reason (`cancelScheduledEnd`, `DELETE /api/employees/[id]/employment/scheduled-end`), kept in history as `scheduled_end_cancelled`. Ending now replaces a schedule. After it applies, Edit ending and Reinstate (ADR-055) work as for any ending.
5. **Final pay accepts it** (slice 4): the `employment_not_ended` check compares the clearance's last working day and the separation type's status with the scheduled end when the employment hasn't ended yet.

## Consequences

- Attendance, leave and the roster read status, so they treat the employee as active until the end is applied, which is the intent.
- Edit ending doesn't change a schedule; cancel it and schedule again.
- Tests: `tests/domains/workforce/scheduled-end.test.ts`.
