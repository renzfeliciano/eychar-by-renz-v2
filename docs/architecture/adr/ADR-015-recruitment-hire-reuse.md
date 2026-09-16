# ADR-015: Recruitment hire flow reuses HireService

## Status

Accepted

## Context

Recruitment (Phase 8a) needs a "Hire" action on an `Applicant` that is far enough along a
`RecruitmentStage` pipeline: it must create a `Person`, `User`-less `Employee`, initial
`Employment`, and initial `EmployeeAssignment` — exactly the same four-document bundle
`HireService.hire()` (Phase 3) already creates for a walk-in hire via `/people/new`.

## Decision

`ApplicantService.hire()` does not duplicate that bundle. It validates the applicant is at the
org's configured final non-terminal stage (the stage immediately before any
`metadata.isTerminal` stage, resolved from `RecruitmentStageService.listCurrent()` — never a
hardcoded `"offer"` string), then calls the existing `HireService.hire()` with the
employee-number/employment-type/position/project/org-unit/location/reports-to fields collected
from the Hire dialog. On success it sets `Applicant.stage` to the terminal "hired" code and
records `hiredEmployeeId` linking to the employee `HireService` just created.

## Consequences

- One hiring code path, one place that enforces "an employee always starts with a Person +
  Employee + Employment + EmployeeAssignment" — Recruitment can't drift from that invariant by
  having its own slightly different creation logic.
- `tests/domains/recruitment/applicant-service.test.ts` asserts the hire test creates a real,
  queryable `Employee` document and that `hiredEmployeeId` resolves to it — not just that the
  applicant's `stage` field changed.
- If Recruitment later needs hire-specific behavior `HireService.hire()` doesn't have (e.g.
  attaching offer-letter metadata), that's a reason to extend `HireService` itself, not to fork
  a second hiring path.
