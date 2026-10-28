# ADR-053: Probation evaluations handled outside EychAr

## Status

Accepted. Extends the dashboard's compliance list (probation deadlines) and the Performance
evaluation form (PCAS-HRMD-FR-004).

## Context

The dashboard's Compliance panel lists "Evaluate <name> before regularization" for every
probationary employee within 30 days of the date they become regular by law. The row was computed
only from the hire date and the type's `regularizeAfterMonths`, so nothing HR did removed it. HR
reported (concerns deck, 27 Oct 2026) that evaluations already sent to the evaluator by email
stayed on the list, inviting duplicate follow-ups. Most evaluations still go out by email or on
paper; some are filled in EychAr's Performance module.

## Decision

- **A small record of what happened outside EychAr:** `EvaluationFollowUp` (Performance domain):
  employee, the probation's regularization date (`dueKey`), `outcome` (`sent` | `completed`), the
  date, who it was sent to, remarks, who recorded it. One active record per probation (partial
  unique index); recording again replaces it. Undo marks it `withdrawn`; nothing is deleted.
  Audited as `evaluation-follow-up.recorded` / `.withdrawn`.
- **Either outcome takes the row off the list right away** (HR's choice). The record shows on the
  employee's Job & history tab, in the Employment terms timeline, so it can be found later.
- **An evaluation submitted in EychAr settles it too.** A submitted or acknowledged evaluation whose
  type is flagged `EvaluationType.metadata.isRegularization` (seeded on "regularization", with that
  code as the legacy fallback) on or after the hire date removes the row. Only employee ids and
  submission dates are read for this.
- **API:** `POST /api/evaluation-follow-ups`, `DELETE /api/evaluation-follow-ups/[id]` (undo), both
  `employees.update`, the same permission that changes the employment itself (ADR-052).
- **UI:** "Mark sent" beside each probation row on the dashboard (for users who may update
  employees): sent or completed, date, sent to, remarks; the toast has Undo.

## Consequences

- A row marked "sent" no longer warns if the evaluation never comes back before the legal
  deadline. HR chose a clean list over that reminder; the note on the profile keeps when it was
  sent and to whom.
- `dueKey` ties a record to one probation, so a rehire or a corrected hire date shows the row again.
- When most evaluations move into EychAr, the follow-up becomes the exception, not the rule.
