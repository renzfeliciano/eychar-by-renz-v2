# ADR-019: Employee roster grows v1's HR fields, kept on the existing Person/Employment split

## Status

Accepted

## Context

The product owner asked that the People page ("Employees Roster" in the legacy v1 app) gain the fields
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

## Addendum: optional remarks

`Person` gains an optional free-text `remarks` (max 200 characters) so HR can note things like "Senior, PWD" on the roster. It is shown as a roster column, in the CSV/print export, and on the profile header, and edited in the Hire form and Edit dialog. It is deliberately **not** part of roster search.

One rule (`remarksSchema`, `src/shared/validation/shared.ts`) is enforced at every layer: the forms check it before submitting, the API routes parse it with zod, and the Mongoose schema carries the same `maxlength`. Hire treats a blank note as unset; edit treats `""` as "clear it" (`$unset`).

Remarks can hold sensitive facts (e.g. PWD status) and travel with the audited, permission-checked export, so share exports only with people who need them.

## Addendum: educational attainment

`Person` gains an optional `educationLevelCode`, the code of an item in a new **Education levels** catalog (`education-levels`, Settings › Catalogs), so HR can record each employee's highest educational attainment. The list is data, not code: a new organization starts from ten levels (elementary graduate up to doctoral or professional degree, `education-level-defaults.ts`), and HR can add, rename or retire levels without a deploy. It follows the other catalogs (`createSimpleCatalogService`, its own `education-levels.create/read/update` permissions).

The person stores the **code**, not the name, and `PersonService` checks it against the organization's active levels when it is set, the same way employment type is checked: permissive until the catalog has items, then it must match an active one. The check runs before any record is written, so a bad level on a hire leaves no orphan person. Hire treats a blank choice as unset; edit treats `""` as "clear it" (`$unset`).

It is shown as a roster column, in the Excel/CSV export (as the level's name) and the print report, on the profile header, and edited in the Hire form and Edit dialog. A level HR later retires still shows for the people who hold it and is kept in their edit form (marked "retired"), but cannot be chosen for anyone new. Like the statutory IDs and remarks, the value is recorded in the audit entry's before/after snapshot, and it is deliberately **not** part of roster search or filtering. Existing employees simply have it unset, so no backfill is needed.

## Addendum: educational background

Beyond the single "Highest educational attainment" level, HR can record each qualification an employee holds in an **Educational background** card on the profile's Overview, under the personal information: a level (from the Education levels catalog), the school, an optional course or degree, and an optional year graduated. An employee can have several entries, including several at the same level.

Each entry is its own `EducationRecord` document, tied to the **Person** (so it follows a rehire) rather than embedded on the Person: every add, edit and removal is then audited on its own, and the person's audit snapshot, which already carries the statutory IDs, doesn't grow with each school. `EducationRecordService` checks the level against the organization's active levels when it is set or changed (so editing the school on an entry whose level HR later retired still works), requires a school, accepts a year from 1900 up to next year, stores a blank course or year as absent, and refuses an entry reached through another employee's address or another organization.

Permissions are the existing ones: `employees.update` adds, edits and removes; the profile's `employees.read` lists. Removal is a plain delete with the audit entry as the record. The highest-level dropdown and the entries are independent and nothing reconciles them. The entries are not part of the roster table, the export or the print report, which keep their single Education column.
