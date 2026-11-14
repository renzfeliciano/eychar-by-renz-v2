# Educational background section: design (short)

**Date:** 2026-11-14. **Status:** draft for the owner's approval. **Size:** small to medium (one new record type, one card).
**Builds on:** the `education-levels` catalog and the "Highest educational attainment" dropdown already built (ADR-019 addendum).

## Intent and why

HR needs an **Educational background section under the employee's personal information** that records the employee's
academic qualifications: not one summary level, but each school, course and graduation, the way a Personal Data Sheet does.

## Goals, non-goals, anti-goals

**Goals**
- Add, edit and remove education entries for an employee from their profile, several per level.
- Each entry: **level** (from the Education levels catalog), **school**, **course or degree**, **year graduated**.
- Keep the existing "Highest educational attainment" dropdown as the quick roster summary.

**Non-goals**
- Period of attendance, honors, units earned, certificate uploads (documents already has a place for scans).
- Showing the entries in the roster table, the export or the print report (the roster keeps its one Education column from the dropdown).
- Deriving the dropdown from the entries, or the reverse. They stay independent.

**Anti-goals**
- An entry with a level no longer in the catalog silently disappearing from view.
- One employee's entries readable or changeable through another organization.

## Constraints

- Layering and rules per `CHANGE_PROTOCOL.md`, ENGINEERING §§ 35–37, 52, 55: rules in a domain service, thin routes, scope from the server, every change audited.
- Education belongs to the **person** (it follows a rehire), so entries hang off the Person like the statutory IDs do.
- The level list is catalog data. A retired level still shows on entries that already use it, and can't be picked for a new one (reuse `educationLevelOptions`).

## Approaches considered

- **A. A separate `EducationRecord` collection, one document per entry.** Chosen. Matches how documents, assets and
  leave balances are modeled, audits each add, edit and removal separately, and keeps the Person document and its audit snapshots small.
- B. An array embedded on `Person`. Simpler, but every edit rewrites and audits the whole person, and the person's audit
  snapshot (already carrying statutory IDs) would carry every school as well.

## The design

### Data
`EducationRecord`: `organizationId`, `personId`, `levelCode` (a catalog code), `school` (required, max 200), `course` (optional, max 200,
for example "BS Computer Science"; blank for elementary and high school), `yearGraduated` (optional integer, 1900 up to next year;
blank for undergraduates or someone still studying), timestamps. Index `{ organizationId, personId }`. No unique constraint: two entries at the same level are allowed.

### Service
`EducationRecordService` in `src/domains/people/`: `listForPerson`, `create`, `update`, `remove`. Every query is scoped by organization and person;
the person must exist in the organization. The level is checked against the active catalog on create, and on update only when it changes,
so editing the school on an entry with a retired level still works. Audit `education-record.created`, `.updated` and `.removed` with before and after.
Removal is a plain delete with the audit snapshot as the record (it is small data a person can re-enter).

### API
`POST /api/employees/[id]/education`, `PATCH` and `DELETE /api/employees/[id]/education/[recordId]`. Permission `employees.update` (the same as editing personal details).
Reading the list uses `employees.read`, which the profile already requires.

### Screen
A **Educational background** card in the profile's Overview, below the personal details: a table of entries (level, school, course, year), ordered by level
(catalog order) then year, with Add, Edit and Remove for people who can update. Empty state invites adding the first entry. The level dropdown uses
`educationLevelOptions`; the year is a four-digit number field.

## Calls made by the writer (change any)

- **Permissions:** no new key; `employees.update` to change, `employees.read` to see.
- **Removing an entry** is a delete, with the audit entry as the record, not a recycle-bin item.
- **Order:** by the level's catalog order, then year graduated (blank years last).
- **The dropdown and the entries are independent.** HR may see a "Highest level" that doesn't match the entries; nothing reconciles them.

## Testing (expectations)

- Service: create, list order, update, remove, validation (school required, year range, level in catalog, retired level kept on edit), organization scoping, person must exist, audit.
- Routes: 401, 403 without `employees.update`, 400, 404 for another organization, 200/201.
- UI: the card lists entries, empty state, add, edit, remove (with confirmation), server errors shown, hidden controls without update permission.

## Left to the builder

Card layout, dialog wording, whether add and edit share one dialog, file names.
