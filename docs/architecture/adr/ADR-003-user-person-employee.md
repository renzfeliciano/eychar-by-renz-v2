# ADR-003: User vs Person vs Employee

## Status

Accepted

## Context

AGENTS.md §3/§13 requires `User` (login identity), `Person` (human identity), `Employee`
(workforce identity), `Employment` (lifecycle), and `EmployeeAssignment` (work assignment) to
stay distinct models, supporting: an employee without login, a user who is not an employee, a
former/rehired employee, a contractor, and multiple assignments — without a schema change.

## Decision

Phase 1 implements only `User` and `Person`, with `User.personId` as an optional reference.
`Employee`, `Employment`, and `EmployeeAssignment` are deliberately **not** created yet — they
belong to Phase 3 (Workforce), once positions, organization units, and projects (Phase 2) exist
for an assignment to reference.

The seeded HR user in Phase 1 is a `User` + `Person` only, with no `Employee` record. This is
intentional and matches a real scenario the model must support (a `Person` who is not necessarily
an employee).

## Consequences

- `personId` on `User` is optional, so a login-only account with no HR profile remains valid.
- When Phase 3 adds `Employee`, it will reference `Person` (not `User`), so an employee without
  login access is representable — resolving the required scenario in AGENTS.md §13 without a
  later migration of the `User`/`Person` split itself.
