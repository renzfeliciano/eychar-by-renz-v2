# ADR-055: Correcting and reversing an employment ending

**Status:** Accepted, 2026-11-14.
**Context:** Until the End employment dialog offered a reason, HR could only record "Terminated". A resignation recorded that way
could not be fixed: ending an employment was one-way, and the API's rehire path (`POST .../employment`) had no screen. HR needs to
correct how an employment ended, and to reverse an ending that was plainly wrong. A real return after leaving stays a rehire
(ENGINEERING §14, ADR-003): a new employment with a new hire date.

## Decision

Two actions on the employee's **latest** employment once it has ended, both with `employees.update` and both audited:

- **Edit ending** (`EmploymentService.correctEnding`, `PATCH /api/employees/[id]/employment/ending`) changes the reason (a status the catalog
  does not count as active headcount), the last day, or the note, in one step: the person is never shown as active in between. The last day
  cannot change once a final settlement that is not cancelled was prepared from it, because that amount was computed from the old date; the
  reason and note always can. Audit `employment.ending_corrected`.
- **Reinstate** (`EmploymentService.reinstate`, `POST /api/employees/[id]/employment/reinstate`) reopens the **same** employment: status Active, no end
  date, no termination reason, so the hire date and length of service continue. A reason is required. It is refused when nothing has ended, when
  final pay was already disbursed, or while a clearance case is open (cancel it first). One conditional update makes a second simultaneous reinstate
  fail rather than duplicate history. Audit `employment.reinstated`.

A final settlement belongs to an employment only if it was created on or after that employment began, so an earlier stint's settlement never blocks
a later reinstatement. `EmploymentService.getEndingState` returns the same messages the actions would throw, so the profile can show why a button is
blocked or a date locked.

Each ending, correction and reinstatement is appended to an optional `endingHistory` on the `Employment` (action, status, last day, reason, who, when),
shown as "Ending history" on the Job tab. It is append-only: a correction adds to the record and never erases the original ending. Rows from before it
have none.

## Consequences

- A resignation recorded as a termination is fixed in the app, audited under the person who fixed it.
- Reinstating clears the end date, so a **draft** payroll run covering the days between ending and reinstatement counts those days as employed and reports
  missing attendance. Released runs are unaffected (they were snapshotted). HR handles the gap days with the usual adjustments. Backfilling the gap is not done.
- Assignment, leave balances and any self-service account were never changed by ending, so reinstating restores nothing. (Termination not closing the open
  assignment is a separate, recorded decision.)
- No new permission key. A separate `employees.reinstate` is easy to add if fewer people should be able to reverse an ending.
- Not covered: reinstating several people at once, an approval step, and a rehire screen.
