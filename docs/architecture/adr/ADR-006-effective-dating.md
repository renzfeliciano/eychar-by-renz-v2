# ADR-006: Effective dating

## Status

Accepted (current-only queries; historical-date queries deferred to Phase 4)

## Context

AGENTS.md §16/§27 requires effective-dated records (not audit logs) as the mechanism for
reconstructing "what was true during this period," and explicitly warns against using today's
policy/state for a historical transaction. `OrganizationUnit` and `Position` are the first two
models in this codebase to need this (matching AGENTS.md's own example schemas for both).

## Decision

Both models carry `effectiveFrom` (required, defaults to creation time) and `effectiveTo`
(optional — unset means "still in effect"). Every `listCurrent(organizationId)` on these two
services filters to `effectiveFrom <= now AND (effectiveTo unset OR effectiveTo >= now)` — the
exact same shape `authorize()` already uses for `RoleAssignment` (ADR-007), so there is one
effective-dating query pattern in the codebase, not a different one per model.

`updateStatus()` can set `effectiveTo` to close out a record (e.g. retiring a unit) without
deleting it — the row remains queryable by anything that later needs historical reconstruction.

**Deliberately not built yet**: a historical-date parameter on `listCurrent` (e.g. "show me the
org structure as of 2025-06-01"). AGENTS.md §18/§57 places "historical date selection" under
Phase 4 (Organizational Chart), once there's an actual UI that needs to select a date and
multiple effective-dated models (`EmployeeAssignment` especially) to reconstruct together. Adding
it to just `OrganizationUnit`/`Position` now, ahead of that model, would be speculative.

## Consequences

- `Location` and `Project` intentionally do **not** get effective dating — they use `status`
  only, matching AGENTS.md §17's own `Project` example schema. If a future requirement needs
  historical location/project state, that's a deliberate schema change then, not an oversight now.
- When Phase 4 adds a historical-date query, it extends the same filter shape (swap `now` for the
  requested date) rather than introducing a new mechanism.
