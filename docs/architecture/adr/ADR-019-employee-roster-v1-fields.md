# ADR-019: Employee roster grows v1's HR fields, kept on the existing Person/Employment split

## Status

Accepted

## Context

The user asked that the People page ("Employees Roster" in the legacy v1 app) gain the fields
and behavior v1's real Employee record has: gender, birth date, address, contact number, and four
statutory ID numbers (SSS/PhilHealth/Pag-IBIG/TIN), each with the exact zod format v1 validates
(`src/schemas/employee.ts`/`src/schemas/shared.ts`); a conditionally-required "end of contract"
date; Age and Length of Service roster columns; and CSV export + a print report.

v1 stores all of this as one flat `Employee` document. This codebase already splits that same
information across `Person` (identity/contact), `Employee` (employeeNumber), `Employment`
(status/type/dates), and `EmployeeAssignment` (position/project/manager) — a deliberate design
from Phase 2/3, not something this task should undo. The fields were added to whichever of those
models already owns that kind of fact, not flattened back into one document.

## Decision

- **`Person`** gains `gender` (`"Male" | "Female"`, a fixed two-value enum — unlike employment
  status/type this isn't an org-configurable business category, so a plain Mongoose enum matches
  v1 exactly rather than becoming a ninth catalog), `birthDate`, `address`, and `sssNumber`/
  `philHealthNumber`/`pagIbigNumber`/`tinNumber`. The four statutory numbers are plain text
  inputs (per explicit instruction — v1's masked auto-formatting inputs were not ported), but
  validated with v1's exact regex (`src/shared/validation/shared.ts`:
  `sssNumberSchema`/`philHealthNumberSchema`/`pagIbigNumberSchema`/`tinNumberSchema`).
- **`Employment`** gains `endOfContract` (optional Date). Whether it's required depends on the
  selected `EmploymentType`'s `metadata.requiresEndOfContract` flag — the catalog-driven
  equivalent of v1's hardcoded `END_OF_CONTRACT_STATUSES = ["Contractual", "Probationary"]` name
  list (`src/lib/employment-status.ts`). `scripts/seed.ts` sets this flag on the seeded
  Contractual/Probationary `EmploymentType` items, and backfills it onto rows that already
  existed before this flag was introduced (see `seedCatalogDefaults`'s per-key `$exists: false`
  guard) — without it, real clusters seeded before this ADR would never get the new behavior.
  v1's `lastDay` concept is not a new field: `Employment.effectiveTo` (already existed, set by
  `terminate()`) already means the same thing.
- **Age / Length of service** are computed, not stored — `src/lib/employee-dates.ts`
  (`calculateAge`/`formatLengthOfService`, ported from v1's `src/lib/employee-dates.ts` and
  adapted to take `Date` objects instead of ISO strings) derives them from `Person.birthDate` and
  `Employment.effectiveFrom` at render time, the same "derive at read time, never store a value
  that can drift" precedent this codebase already uses for `LeaveBalance.getAvailable()`.
- **CSV export and print report**, matching v1's roster feature (leave-balance columns from v1's
  version were left out — this app already has a separate `/leave/balances` page, so embedding
  them in the roster export would duplicate that view rather than mirror a gap). Both reuse
  `src/lib/csv.ts` and the `hidden print:block` Tailwind print-report convention established in
  ADR-018.

## Consequences

- The Hire form (`/people/new`) is the only place these new fields are collected today; there is
  no general "edit an existing employee's profile" dialog yet — out of scope for this task, and a
  natural next addition if requested.
- A person hired before this ADR simply has these fields `undefined` — Age/Length of Service
  render as "—" for them, not an error, since every new field is optional at the schema level.
