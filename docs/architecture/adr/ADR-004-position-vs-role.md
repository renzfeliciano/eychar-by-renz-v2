# ADR-004: Position vs Role

## Status

Accepted

## Context

AGENTS.md §4/§11/§12 distinguishes `Position` (organizational/job structure — "what position
exists") from `Role` (application authorization grouping — "what capabilities can this user
have"). §12 additionally warns that a position must never be assumed to define a reporting
relationship: "Operations Manager" does not by itself mean anyone reports to anyone.

## Decision

`Position` (`src/server/db/models/position.ts`) is pure organizational data: `title`, `code`,
optional `organizationUnitId`, `status`, effective dating. It is never read by
`authorize()`/`requirePermission`, and no route or service branches on a position's `title` or
`code`. Authorization stays entirely on the `RoleAssignment`/`Role`/`Permission` chain (ADR-007) —
completely independent of whichever `Position` a person happens to hold.

Reporting relationships are explicitly **not** derived from `Position` here. Phase 2 doesn't yet
have `EmployeeAssignment` (that's Phase 3), so there is nothing to wire up yet — but when it
arrives, `EmployeeAssignment.reportsToEmployeeId` will be the source of the reporting edge, not
any inference from two people's position titles.

## Consequences

- Renaming, retitling, or reorganizing positions has zero effect on anyone's access — there is no
  code path where it could.
- When Phase 3 introduces `EmployeeAssignment`, reporting structure is a separate field on that
  model, not a lookup through `Position`. If matrix reporting is ever required, that motivates a
  dedicated `ReportingRelationship` model (AGENTS.md §12) — not overloading `Position` for it.
