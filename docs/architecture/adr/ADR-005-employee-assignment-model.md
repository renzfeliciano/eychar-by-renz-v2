# ADR-005: Employee Assignment model — the transfer mechanic

## Status

Accepted

## Context

AGENTS.md §15 calls `EmployeeAssignment` "one of the most important domain models." §16
requires historical organizational structure to be reconstructable from effective-dated records,
not audit logs. §59's required historical test is explicit: move Employee A from
Position=Supervisor/Project=A/Manager=B (2025) to Position=Operations Manager/Project=B/
Manager=C (2026), and the system must preserve the 2025 assignment, create the 2026 one, show
the current state correctly, reconstruct the historical state on request, and keep the same
employee identity throughout.

## Decision

Moving an employee is never an in-place edit. `EmployeeAssignmentService.transfer(employeeId,
organizationId, fields, actor)`:

1. Validates every referenced `positionId`/`organizationUnitId`/`projectId`/`locationId` belongs
   to the same organization (same FK-check pattern as Phase 2's `OrganizationUnitService`/
   `PositionService`/`ProjectService`), and that `reportsToEmployeeId` is a different employee in
   the same organization (self-report guard, same pattern as `OrganizationUnitService`'s
   `parentUnitId` self-reference guard).
2. Closes the employee's current assignment by setting its `effectiveTo` to the new assignment's
   `effectiveFrom` — the row is never deleted or overwritten.
3. Creates a brand-new `EmployeeAssignment` row for the new state.

Three read methods answer the three questions AGENTS.md's test requires: `getCurrent(employeeId)`
(the open row, `effectiveTo` unset), `getAsOf(employeeId, date)` (whichever row was effective on
that date — this is what "historical date selection" in the future Org Chart phase will call),
and `getHistory(employeeId)` (every row, in order).

`Employee` itself never changes across a transfer — `employeeId` is the constant thread through
every assignment row, so "same employee identity" (§59) falls out of the schema rather than
needing special handling.

## Consequences

- `tests/domains/workforce/employee-assignment-service.test.ts` reproduces §59's scenario
  literally (2025 assignment, transfer to 2026, assert all four properties) — this is the one
  test in the codebase that most directly proves a core AGENTS.md requirement, not just an
  implementation detail.
- No Mongo transaction wraps `transfer()`'s two writes (close old, create new) — consistent with
  Phase 1/2's restraint on infrastructure (AGENTS.md §33) and with the fact that
  `mongodb-memory-server`'s default standalone test instance doesn't support multi-document
  transactions either. If a partial-failure incident is ever observed in practice, that's a
  concrete reason to revisit — not a preemptive one.
- The same `transfer()` method handles every kind of move (position change, project change,
  manager change, or all three at once) — there is no separate "promote" or "reassign manager"
  operation, because AGENTS.md's model doesn't distinguish them; they're all just a new
  `EmployeeAssignment` row.
