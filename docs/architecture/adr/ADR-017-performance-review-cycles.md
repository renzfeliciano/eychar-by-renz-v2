# ADR-017: Performance review cycles

## Status

Accepted

## Context

Phase 8's Performance domain needs a rating scale and a way to record a review per employee
per period. AGENTS.md §25 names `PerformanceRatingScale` alongside `LeavePolicy`/
`AttendancePolicy`/`PayrollPolicy` as a strongly-typed domain policy — but unlike those, a
rating scale is really an ordered list of levels (Needs Improvement, Meets Expectations, …),
which is exactly the shape the Catalog system (ADR-016) already exists to manage, not a
policy document with resolvable fields.

## Decision

- **`PerformanceRating`** is the catalog system's eighth entity: another `buildSimpleCatalogSchema()`/
  `createSimpleCatalogService()` pair, registered in `CATALOG_REGISTRY` as `performance-ratings`.
  `sortOrder` gives the scale its order (Needs Improvement < Meets Expectations < Exceeds
  Expectations < Outstanding); nothing about the scale's levels or count is hardcoded.
- **`ReviewCycle`** (`organizationId`, `name`, `periodStart`, `periodEnd`, `status: draft | open |
  closed`) is a simple container, structurally close to `JobOpening` but with an extra `draft`
  stage before `open` — HR sets up the cycle's name and dates before reviewers can act against
  it. Transitions are forward-only (`draft→open→closed`), enforced the same way
  `EmploymentService`/`ApplicantService` enforce their own forward-only transitions.
- **`PerformanceReview`** (`organizationId`, `reviewCycleId`, `employeeId`, `reviewerId`,
  `ratingCode`, `comments`, `status: draft | submitted`) links one employee to one cycle
  (unique per `{organizationId, reviewCycleId, employeeId}` — one review per employee per
  cycle). `ratingCode` is a plain trimmed String validated via
  `PerformanceRatingService.assertValidCode()` at submit time — the same catalog-driven,
  permissive-when-unconfigured pattern `AttendanceRecord.status`/`Applicant.stage` already use.
  `create()` starts a review in `draft` with no rating; `submit()` is the one mutating action,
  requiring a valid `ratingCode` and locking the review (no un-submit — a correction is a new
  review, matching this codebase's "never edit an audited stint in place" precedent).
- No separate `.approve` permission: unlike Leave (`leave.approve`) or Payroll
  (`payroll.approve`), submitting a review is a single-actor action (the reviewer records and
  finalizes their own assessment), so `performance-reviews.create`/`performance-reviews.update`
  are sufficient — matching Attendance's simpler create/update-only shape rather than Leave's
  request/approve split.
- No employee-facing "acknowledge" step. This codebase has no employee self-service portal yet
  (Attendance/Leave are HR-recorded, not employee-initiated) — inventing an acknowledgment
  workflow now would be speculative. If self-service is added in a later phase, acknowledgment
  becomes a natural addition to `PerformanceReview.status`, not a redesign.

## Consequences

- `tests/domains/performance/review-cycle-service.test.ts` and
  `tests/domains/performance/performance-review-service.test.ts` prove: cycle creation and
  forward-only status transitions (rejecting a re-open of a closed cycle), review creation,
  submit rejecting a missing rating, submit rejecting a rating code not configured in the org's
  catalog, and submit accepting one that is — plus listing by cycle and by employee.
- Adding a ninth catalog type (e.g. a future `AssetCategory` or `DocumentType`) follows the exact
  same four-step recipe ADR-016 already established: schema factory call, service factory call,
  registry entry, Settings page section.
