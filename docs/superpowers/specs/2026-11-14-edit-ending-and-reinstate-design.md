# Edit ending and Reinstate: design (short)

**Date:** 2026-11-14. **Status:** draft for the owner's approval. **Size:** small to medium (one domain, two actions).
**Code read:** `src/domains/workforce/employment-service.ts`, `src/app/api/employees/[id]/employment/route.ts`,
`src/server/db/models/employment.ts`, `src/app/(app)/people/[id]/page.tsx`, `end-employment-dialog.tsx`,
`src/server/db/models/clearance-case.ts`, `final-settlement.ts`, `knowledge/domains/clearance.md`, `final-settlement.md`.

## Intent and why

HR ended an employee as **Terminated** because the system had no way to record a resignation. The record is now wrong, and today
nothing can fix it: an ended employment is one-way. HR needs to (1) **correct** how an employment ended, and (2) when an ending was
genuinely wrong, **reinstate** the person. A real return after leaving stays a **rehire**, a new employment, as designed
(ENGINEERING §14, ADR-003).

## Goals, non-goals, anti-goals

**Goals**
- Fix the reason, last day or note of an ended employment in one step (for example Terminated to Resigned), without the person ever showing as active.
- Reinstate an employee so their employment is open again with continuous service, with the reason recorded and the earlier ending kept in history.
- Both are audited and visible on the profile.

**Non-goals**
- A rehire screen for a genuine return (new employment, new hire date). Left as is; a follow-up if wanted.
- Backfilling attendance, leave or payroll for the days between ending and reinstatement.
- Reinstating several people at once, or an approval workflow.

**Anti-goals**
- Reactivating someone whose final pay was already paid out, or who is mid-clearance.
- Rewriting the audit trail: a correction adds history, it never erases the original ending.

## Constraints

- Layering and rules per `CHANGE_PROTOCOL.md` and ENGINEERING §§ 35–37, 52, 55: the rules live in `EmploymentService`, routes only orchestrate, scope comes from the server, every change is audited.
- What "ends employment" is catalog data (`EmploymentStatus.isActiveHeadcount`), never a code list. Reuse `endReasonChoices` and the End employment dialog's patterns.
- Dates are calendar-day keys in the organization's zone (ADR-045); the end date can't be in the future or before the hire date (same rules as End employment).

## Approaches considered

- **A. Reinstate only.** Two steps for a label fix, and the person shows as active in between (counted in headcount and payroll). Rejected for the label case.
- **B. Edit ending only.** Perfect for label fixes, but can't undo a wrong termination.
- **C. Both.** Chosen by the owner. Edit ending for corrections, Reinstate for reversals.

## The design

### Edit ending
- Available on an **ended** employment (status not active headcount, `effectiveTo` set), when the employee has no newer employment row.
- Changes: reason (a non-active catalog status), last day, note. Same validation as End employment (no future date, not before hire, an active status is refused, a note where the reason requires one).
- **Last-day change is refused** if a final settlement exists that is not cancelled, because that amount was computed from the old last day. Reason and note can always change.
- Audit `employment.ending_corrected` with before and after.

### Reinstate
- Reopens the **same** employment: clears `effectiveTo`, sets status to Active, so length of service continues from the original hire date.
- **Reason is required** and recorded with who and when.
- Refused when: the employment isn't ended; a **newer employment** exists (already rehired); a **final settlement was disbursed**; a **clearance case is still open** (cancel it first, with its reason, then reinstate). The message says which.
- Assignment, leave balances and any self-service account were never changed by ending, so nothing needs restoring.
- Audit `employment.reinstated` with before and after and the reason.

### History
Each ending, correction and reinstatement is appended to an optional `endingHistory` list on the employment (action, status, last day, reason, who, when), the same pattern as `termsHistory`. The profile's Job tab shows it. Existing rows have no history and read as empty.

### Screens and API
- On the profile of an ended employee (permission `employees.update`, see calls below): **Edit ending** and **Reinstate** buttons next to the status badge.
- New routes beside the existing ones: `PATCH /api/employees/[id]/employment/ending` (edit) and `POST /api/employees/[id]/employment/reinstate`.
- Dialogs follow End employment: reason picker driven by the catalog, dates in the organization's zone, server errors shown in the dialog.

## Calls made by the writer (change any)

- **Permissions:** both use the existing `employees.update`, like End employment, rather than a new key. A separate `employees.reinstate` is easy to add if you want it limited to fewer people.
- **Open clearance blocks reinstatement** (cancel it first), rather than reinstating and leaving a clearance running.
- **Last day is locked once a final settlement exists**; the reason and note are not.
- **Reinstate sets status to Active**, not to whatever status the person had before (for example On Leave).

## Risks to know

- **Payroll gap.** Reinstating clears the end date, so any draft payroll run that covers the days between ending and reinstatement will count those days as employed and report missing attendance. Released runs are unaffected (they were snapshotted). HR handles the gap days with the usual adjustments. Backfilling is out of scope.
- **Hidden employees and the recycle bin** are not touched. A person already in the recycle bin must be restored there first.

## Testing (expectations)

- Service: every guard (not ended, newer employment, disbursed settlement, open clearance, wrong organization, future or pre-hire date, active status), the success paths, history entries, and audit.
- Historical: reinstating leaves earlier payroll records and attendance unchanged.
- UI: both dialogs (validation, server error shown, success refreshes), and the buttons appear only for ended employees and users who can update.
- Authorization: refused without `employees.update`.

## Left to the builder

Button placement and wording, how the history is laid out in the Job tab, file names, and whether the two dialogs share a component.
