# Employee IDs and licenses: design

**Date:** 2026-11-16. **Status:** Built 2026-11-16 (approved design; all 8 tasks done, see "Build record" at the end). **Size:** medium. **Branch:** worked directly on `main` (owner's instruction). Not committed (the owner has not asked for a commit).
**Builds on:** the educational-background pattern ([educational-background.md](./educational-background.md)) and the catalog domain ([../domains/catalog.md](../domains/catalog.md)).

## Intent and why

HR asked for three changes to the employee information module, to support benefits administration, statutory compliance and company reporting:

1. Remove the employee **RDO code** and **ZIP code** fields (not relevant to the information the system keeps). Replace them with **PWD ID number + validity date** and **Solo Parent ID number + validity date**.
2. A dedicated **PRC license** section: license number, license type / profession, expiration (validity) date, so renewals can be monitored.
3. An **Add Government ID** feature, instead of one hard-coded field per government ID. The owner stressed it must be flexible.

The owner also wants **expiry alerts** for the validity dates.

## Goals, non-goals, anti-goals

**Goals**
- RDO and ZIP removed from the employee profile completely (owner confirmed 2026-11-16), including the BIR 2316 export's employee columns.
- PWD and Solo Parent as four optional fields on the person.
- PRC licenses and extra government IDs as repeating records, several per employee.
- Government ID types and PRC professions are admin-managed catalogs, so HR adds a type without a code change.
- Expired and soon-to-expire dates are highlighted on the profile and appear on the dashboard to-do list.

**Non-goals**
- Per-type catalog settings (validity required, alert window). Catalog `metadata` is write-once and the editor cannot show it (catalog.md known gaps).
- Scans or photos of IDs (employee documents already hold scans).
- Per-type number format validation (formats vary too much). Numbers are trimmed free text, max 50.
- Showing the new data in the roster table, export or print report.
- Removing the **employer's** RDO and ZIP (`organization.ts`, `employer-tax-service.ts`, the employer tax form). They stay.

**Anti-goals**
- A retired ID type or profession silently vanishing from an entry that already uses it.
- One organization reading or changing another's records.
- The BIR 2316 export failing or shifting columns wrongly after the removal.

## Constraints

- Layering per `CHANGE_PROTOCOL.md`, ENGINEERING §§ 35-37, 52, 55: rules in a domain service, thin routes, scope from the server, every change audited.
- Both records belong to the **person** (they follow a rehire), like education entries.
- Catalog rules: `code` never changes; a catalog item is deactivated, never deleted; validation is permissive while a catalog is empty.
- Dates follow the project's Manila date-key handling (`localDateKey`), not the UTC day (known-gaps B3).

## Approaches considered

- **A. Fixed person fields for PWD and Solo Parent, repeating records for PRC and other IDs, two catalogs.** Chosen. Matches "replace the RDO and ZIP fields", reuses a proven pattern, audits each add, edit and removal.
- B. One generic ID-record model for everything. Less code, but PWD and Solo Parent leave the edit form and PRC-specific fields get awkward.
- C. Arrays embedded on `Person`. No new models, but no per-item audit and no recycle-bin behavior, and the person audit snapshot grows.

For the ID type: free text per entry was rejected (spellings drift, no reporting by type). For the PRC profession: free text was rejected for the same reason.

## The design

### 1. Removal of RDO and ZIP (employee only)
Remove `rdoCode` and `zipCode` from: `Person` model, `PersonService` (input type and audit snapshot), `updateEmployeeProfileSchema`, `PATCH /api/employees/[id]`, the edit dialog, the profile page (including the `profile-rdo-zip` line), `year-end-report.ts` (the select, the row fields and the two export columns), and tests (`tests/shared/rdo-zip-validation.test.ts` is deleted; `edit-employee-dialog.test.tsx` updated). A one-off script `scripts/` clears the stored values with `$unset` on existing Person documents (idempotent, dry-run by default). The 2316 export keeps every other column; the builder checks any consumer that reads columns by position.

### 2. PWD and Solo Parent (fields on Person)
`pwdIdNumber`, `pwdIdValidUntil`, `soloParentIdNumber`, `soloParentIdValidUntil`. All optional. Number: trimmed, max 50. Date: a date key. The existing clearable pattern applies: `""` clears (becomes `$unset`). A validity date without a number is allowed (HR may know the expiry first); the builder may refuse it if that proves confusing.

### 3. Catalogs
- `government-id-types`: seeded with Driver's License, Passport, UMID, Voter's ID, Postal ID, National ID, Senior Citizen ID, Barangay ID. Built from `buildSimpleCatalogSchema` with a one-line service, a registry entry and seeded `government-id-types.create/read/update` keys, as `catalog.md` requires.
- `prc-professions`: seeded with the common PRC-regulated professions (for example Civil Engineer, Electrical Engineer, Mechanical Engineer, Architect, Nurse, Certified Public Accountant, Teacher, Medical Technologist, Pharmacist, Physician). The builder takes the list from the PRC's published list of regulated professions and keeps it as a defaults file, like `education-level-defaults.ts`.
- Both appear in Settings → Catalogs automatically through the registry.

### 4. Records (own collections, like `EducationRecord`)
- `GovernmentIdRecord`: `organizationId`, `personId`, `typeCode` (catalog code, optional) **or** `otherTypeName` (free text, max 100) when "Other" is chosen (exactly one is set), `idNumber` (required, max 50), `validUntil` (optional date key), timestamps. Index `{ organizationId, personId }`.
- `ProfessionalLicenseRecord`: `organizationId`, `personId`, `professionCode` (catalog code, required), `licenseNumber` (required, max 50), `validUntil` (optional date key), timestamps. Same index.
- Services in `src/domains/people/`: `list/create/update/remove` per record, scoped by organization and person, the catalog code checked against the active catalog on create and on update only when it changes (a retired code stays on existing entries), audited as `government-id-record.*` and `professional-license-record.*` with before and after. Removal is a plain delete with the audit entry as the record.
- Employee deletion moves both record types to the recycle bin with the employee and restores them (`deletion-registry` `planEmployee`, as education does).

### 5. API
`POST /api/employees/[id]/government-ids`, `PATCH` and `DELETE .../[recordId]`; the same three for `/api/employees/[id]/prc-licenses`. Permission `employees.update` to change, `employees.read` to view.

### 6. Screens
- Edit dialog: the RDO and ZIP inputs are replaced by the four PWD and Solo Parent inputs.
- Profile Overview: a **Government IDs** card and a **PRC licenses** card under the personal details, each a table with Add, Edit and Remove for people who can update. PWD and Solo Parent show in the personal details with their validity.
- Expiry status chip on every dated item: **Expired** (before today) and **Expiring soon** (within 30 days), by Manila date. Items without a date show no chip.

### 7. Alerts
A pure function in `src/domains/dashboard/compliance-risks.ts` (beside `documentRisks`, window `RISK_WINDOW_DAYS` = 30) takes the dated items and returns risks for the dashboard action queue, one row per employee item, collapsing past the existing per-kind limit. Loaded only for viewers holding `employees.read`. A bulk loader in the people domain supplies all of the organization's dated items in one query per collection. Employees who are no longer active headcount are excluded (the builder confirms how `documentRisks` filters them and matches it).

## Calls made by the writer (change any)
- Validity date is optional everywhere; alert window is the fixed 30 days.
- The same ID type may be added twice for one employee (renewed card, second passport). No uniqueness rule.
- "Other (type a name)" is offered on the ID type so HR is never blocked while a type is missing.
- New numbers appear in audit snapshots like the existing statutory IDs; recorded in known-gaps.
- Permission keys: no new employee permission; three new catalog keys per catalog.

## Testing (expectations)
- Services: create, list order, update, remove, validation (required fields, lengths, date format, catalog code, exactly one of type or other name), retired code kept on edit, organization scoping, person must exist, audit.
- Routes: 401, 403 without `employees.update`, 400, 404 for another organization, 200/201.
- Person fields: set, clear, date format, audit; absence of `rdoCode` and `zipCode` everywhere (a grep-style standards test or updated tests).
- 2316 export: still builds and has no employee RDO or ZIP column.
- Alerts: expired, within 30 days, outside the window, no date, inactive employee, collapse.
- UI: cards, empty state, add, edit, remove with confirmation, retired type shown, chips, hidden controls without permission.
- Migration script: dry run changes nothing; run clears both fields; second run is a no-op.

## Knowledge files to update when built
`domains/people.md`, `domains/catalog.md`, `domains/dashboard.md`, `domains/payroll.md` (2316 export), `domains/deletion.md`, `reference/data-model.md`, `reference/authorization.md`, `reference/testing.md`, `known-gaps-and-mismatches.md` (the RDO/ZIP entry, B26 context, new audit exposure), `plans/payroll-enhancement.md` (Phase 4 mention), `docs/architecture/adr/ADR-060-year-end-tax-adjustment.md` (addendum), `README.md` (this plan, model count), and the "Last verified" line of each.

## Left to the builder
Card layout and dialog wording, file names, the exact seed lists, the migration script's name, and whether add and edit share one dialog.

---

# Part 2: Employee IDs and licenses implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the employee RDO and ZIP with PWD and Solo Parent IDs, add PRC licenses and flexible government IDs (both catalog-backed), and alert on expiring dates.

**Architecture:** Four person fields; two new repeating-record collections modeled on `EducationRecord` (service, three thin routes, a profile card and dialog each); two new simple catalogs; a pure expiry-status helper used by the profile chips and by a new dashboard risk row.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing route or page code, per `AGENTS.md`), TypeScript, Mongoose, Zod, vitest + Testing Library.

**Spec:** Part 1 of this file (approved 2026-11-16).

## Global Constraints

- Work on `main`. Stage files by explicit path; do not commit unless the owner asks. Other sessions share the checkout, so never `git add -A`.
- Permissions: `employees.update` changes records, `employees.read` views them. Each new catalog gets `<slug>.create`, `<slug>.read`, `<slug>.update` (category `settings`), slugs `government-id-types` and `prc-professions`.
- Dates: a record's `validUntil` is a date key `"YYYY-MM-DD"` at the API and view layer, stored as a `Date` via `dateKeyToDate` and read back via `dateToDateKey` (`src/lib/date-key.ts`). "Today" is `localDateKey()` (Manila). Person fields `pwdIdValidUntil` and `soloParentIdValidUntil` are `Date`, sent as `YYYY-MM-DD` like `birthDate`.
- Numbers: trimmed, 1 to 50 characters, no format check. Other-type name: trimmed, 1 to 100 characters.
- Alert window: `RISK_WINDOW_DAYS` (30). Expired means before today; a date equal to today is "expiring", not expired.
- Catalog codes are checked on create, and on update only when they change. A retired code stays on entries that use it.
- Every record write is audited with before and after. Removal is a plain delete. Every query filters by `organizationId`, and by `personId` for records.
- Employer RDO and ZIP (`organization.ts`, `employer-tax-service.ts`, the employer tax form, the employer columns of the 2316 export) are untouched.

## Review Focus

- The same ID type added twice for one employee: allowed, both listed (Task 4).
- An entry whose ID type or profession HR later retired: still listed and editable, not selectable for new entries (Tasks 4, 5, 6).
- A validity date of today: shows "Expiring soon" and a dashboard row, not "Expired" (Tasks 6, 7).
- A rehired person with two employee records: one alert, for the active employee only (Task 7).
- Clearing a validity date or a PWD number on edit really removes it, and the chip and alert disappear (Tasks 2, 4, 5).

---

### Task 1: Remove employee RDO and ZIP

**Files:**
- Modify: `src/server/db/models/person.ts`, `src/domains/people/person-service.ts`, `src/shared/validation/workforce.ts`, `src/app/api/employees/[id]/route.ts`, `src/app/(app)/people/[id]/edit-employee-dialog.tsx`, `src/app/(app)/people/[id]/page.tsx`, `src/domains/payroll/year-end-report.ts`
- Create: `scripts/remove-employee-rdo-zip.ts`, `tests/domains/people/person-rdo-zip-removed.test.ts`
- Delete: `tests/shared/rdo-zip-validation.test.ts`
- Modify tests: `tests/app/edit-employee-dialog.test.tsx` and any year-end test that asserts the employee RDO or ZIP (`grep -rn "rdoCode\|zipCode\|RDO code\|ZIP code" tests`)

**Interfaces:**
- Produces: `PersonModel` without `rdoCode` and `zipCode`; the 2316 table without headers `"5 RDO code"` and `"6A ZIP code"` (employer headers `"14A Employer ZIP code"` and the rest unchanged); `scripts/remove-employee-rdo-zip.ts`, run as `npx tsx scripts/remove-employee-rdo-zip.ts` (dry run, prints how many Person documents hold either field) and `... --apply` (unsets both).

- [ ] **Step 1: Write the failing test** `person-rdo-zip-removed.test.ts`: `PersonModel.schema.path("rdoCode")` and `path("zipCode")` are `undefined`; `updateEmployeeProfileSchema.parse({ organizationId, firstName: "A", lastName: "B", rdoCode: "039", zipCode: "1100" })` returns an object with neither key; the built 2316 table's `headers` contain `"14A Employer ZIP code"` and not `"5 RDO code"` or `"6A ZIP code"`, and each row has `headers.length` cells (use the existing year-end test's fixture for the table).
- [ ] **Step 2: Run** `npx vitest run tests/domains/people/person-rdo-zip-removed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Remove** both fields everywhere in the Files list: model, `CreatePersonInput` and the `before` snapshot, the clearable schema entries, the route's two lines, the dialog's state, props, `EDIT_EMPLOYEE_FIELDS` entries and two inputs, the profile page's two props and the `profile-rdo-zip` paragraph, and in `year-end-report.ts` the `rdoCode`/`zipCode` row fields, the `select` names, the two header strings and the two row cells. Delete the old validation test and fix the dialog and year-end tests.
- [ ] **Step 4: Write the script.** Uses `PersonModel.collection` (bypasses Mongoose's strict filter, which would drop unknown paths) with `{ $or: [{ rdoCode: { $exists: true } }, { zipCode: { $exists: true } }] }`; dry run only counts; `--apply` runs `updateMany` with `$unset`; a second `--apply` reports 0. Close the connection at the end.
- [ ] **Step 5: Run** the new test, `npx vitest run tests/app/edit-employee-dialog.test.tsx tests/domains/payroll`, and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Stage** the files by path.

### Task 2: PWD and Solo Parent fields

**Files:**
- Modify: `person.ts`, `person-service.ts`, `workforce.ts` (`updateEmployeeProfileSchema` only; the hire form does not collect these), `src/app/api/employees/[id]/route.ts`, `edit-employee-dialog.tsx`, `src/app/(app)/people/[id]/page.tsx`
- Test: `tests/domains/people/person-pwd-solo-parent.test.ts`; extend `tests/app/edit-employee-dialog.test.tsx`

**Interfaces:**
- Produces: `Person` fields `pwdIdNumber?: string`, `pwdIdValidUntil?: Date`, `soloParentIdNumber?: string`, `soloParentIdValidUntil?: Date`; `CreatePersonInput` and `UpdatePersonInput` carry them (`""` clears, per the existing `Clearable` type); `updateEmployeeProfileSchema` accepts `pwdIdNumber` and `soloParentIdNumber` as `clearable(idNumberSchema)` and the two dates as `clearable(z.coerce.date())`; shared `idNumberSchema` (trimmed, 1 to 50, message "An ID number can be at most 50 characters.") exported from `src/shared/validation/shared.ts`.

- [ ] **Step 1: Write the failing tests:** service: `PersonService.update` sets the four fields, then `""` clears each (document has no such key afterwards), audit `before` and `after` include them; schema: a 51-character number is refused, a bad date is refused, `""` is accepted; dialog: four inputs labelled "PWD ID number", "PWD ID valid until", "Solo Parent ID number", "Solo Parent ID valid until" send `pwdIdNumber` etc. in the PATCH body, pre-filled from `initialValue` (dates as `YYYY-MM-DD`).
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement** across the listed files, mirroring how `birthDate` and `tinNumber` are handled (dialog date input like the birth-date input; page passes `initialValue` dates via `.toISOString().slice(0, 10)`). In the profile's personal-details area, replace the old RDO/ZIP line with two lines, test ids `profile-pwd` and `profile-solo-parent`, each showing number and valid-until (or "not set"); chips come in Task 6.
- [ ] **Step 4: Run** both files and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Stage.**

### Task 3: The two catalogs

**Files:**
- Create: `src/server/db/models/government-id-type.ts`, `src/server/db/models/prc-profession.ts`, `src/domains/catalog/government-id-type-service.ts`, `src/domains/catalog/prc-profession-service.ts`, `src/domains/catalog/government-id-type-defaults.ts`, `src/domains/catalog/prc-profession-defaults.ts`, `src/domains/catalog/catalog-option-name.ts`
- Modify: `src/server/db/models/index.ts`, `src/domains/catalog/catalog-registry.ts`, `scripts/seed.ts`, `src/components/shared/nav-links.tsx` (`CATALOG_READ_PERMISSIONS`), `src/app/(app)/settings/catalogs/page.tsx`
- Test: `tests/domains/catalog/government-id-type-catalog.test.ts`, `tests/domains/catalog/prc-profession-catalog.test.ts`; extend `tests/domains/catalog/catalog-registry.test.ts`

**Interfaces:**
- Produces: `GovernmentIdTypeModel`, `PrcProfessionModel` (built from `buildSimpleCatalogSchema`); `GovernmentIdTypeService` and `PrcProfessionService` (`createSimpleCatalogService(model, "GovernmentIdType" | "PrcProfession")`); `GOVERNMENT_ID_TYPE_DEFAULTS` and `PRC_PROFESSION_DEFAULTS` as `{ code; name; sortOrder }[]`; registry slugs `"government-id-types"` and `"prc-professions"`; `catalogOptionName(items: { code: string; name: string }[], code?: string | null): string` (the item's name, else the code, else `""`) and `catalogOptions(items: { code; name; status?: string }[], currentCode?: string | null): { id: string; label: string }[]` (active items, plus the current code marked "(retired)" when inactive or missing), both in `catalog-option-name.ts`. Reuse `catalogChoiceOptions` and `catalogChoiceName` if the profile page's existing helpers (used for civil statuses) already do this; then do not add the new file.

- [ ] **Step 1: Write the failing tests** modeled on `education-level-catalog.test.ts` and `civil-status-catalog.test.ts`: create, list in sort order, duplicate code conflict, deactivate; the defaults arrays have unique codes and include `drivers_license`, `passport`, `umid`, `voters_id`, `postal_id`, `national_id` and `civil_engineer`, `nurse`, `certified_public_accountant`; the registry has both slugs with the right permission prefixes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the four-piece recipe from `catalog.md`. Seed `<slug>.create/read/update` permission keys beside the education-level ones and add `seedCatalogDefaults` calls. Check how `education-levels.*` keys are granted to roles in `seed.ts` and grant the new keys the same way. Add both slugs to `CATALOG_READ_PERMISSIONS` and add a section for each on the Catalogs page.
- [ ] **Step 4: Run** the three test files and `npm run typecheck`. Expected: PASS. Note in the final summary that existing databases need `npm run db:seed` for the new permission keys and defaults.
- [ ] **Step 5: Stage.**

### Task 4: Government ID records

**Files:**
- Create: `src/server/db/models/government-id-record.ts`, `src/domains/people/government-id-record-service.ts`, `src/app/api/employees/[id]/government-ids/route.ts`, `src/app/api/employees/[id]/government-ids/[recordId]/route.ts`
- Modify: `src/server/db/models/index.ts`, `src/shared/validation/workforce.ts`
- Test: `tests/domains/people/government-id-record-service.test.ts`, `tests/app/api/government-id-routes.test.ts`

**Interfaces:**
- Consumes: `GovernmentIdTypeService.assertValidCode(organizationId, code)`.
- Produces: `GovernmentIdRecordModel` (`organizationId`, `personId`, `typeCode?`, `otherTypeName?`, `idNumber`, `validUntil?: Date`, timestamps; index `{ organizationId: 1, personId: 1 }`); `GovernmentIdRecordService.listForEmployee(employeeId: string, organizationId: string): Promise<GovernmentIdRecordRow[]>` (ordered by catalog `sortOrder` of the type, "other" entries last, then `idNumber`), `.create(input: { organizationId; employeeId; typeCode?: string; otherTypeName?: string; idNumber: string; validUntil?: string }, actor: { userId?: string })`, `.update(employeeId, recordId, organizationId, patch: { typeCode?: string; otherTypeName?: string; idNumber?: string; validUntil?: string | null }, actor)`, `.remove(employeeId, recordId, organizationId, actor)`; `GovernmentIdRecordView = { id: string; typeCode: string | null; otherTypeName: string | null; idNumber: string; validUntil: string | null }`; `toGovernmentIdRecordView(row)`; schemas `createGovernmentIdRecordSchema`, `updateGovernmentIdRecordSchema`, `removeGovernmentIdRecordSchema` in `workforce.ts`; routes `POST .../government-ids` (201 `{ record }`), `PATCH` and `DELETE .../[recordId]` (200).

- [ ] **Step 1: Write the failing service tests:** creates with a catalog type and with an other-type name; refuses both or neither of `typeCode` and `otherTypeName`, a blank or 51-character number, a 101-character name, a bad date string (`"2026-13-40"`, `"soon"`); stores no `validUntil` when blank; the same type twice for one employee is allowed and both list; a type code not in the catalog is refused once the catalog has items; update changes the number on an entry whose type was retired, refuses switching to a retired type, switches from type to other name (unsets `typeCode`) and back, clears `validUntil` with `null`; remove deletes and audits; removing another employee's entry in the same organization throws `NotFoundError`; every method throws `NotFoundError` for another organization's employee; audit actions `government-id-record.created`, `.updated`, `.removed` with before and after.
- [ ] **Step 2: Run** `npx vitest run tests/domains/people/government-id-record-service.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the model and service by copying `education-record-service.ts` (same `personOf`, `snapshot`, `$set`/`$unset` update shape, same actor and audit calls). Validate the date key with a regex plus a real-date round trip through `dateKeyToDate` and `dateToDateKey`.
- [ ] **Step 4: Run** the service test. Expected: PASS.
- [ ] **Step 5: Write the failing route tests** in the style of `tests/app/api/education-routes.test.ts`: 201 and 200 happy paths, 401 with no session, 403 for a user with only `employees.read`, 400 for a malformed id or body, 404 for another organization.
- [ ] **Step 6: Implement** the schemas and the two route files by copying the education routes (`requirePermission("employees.update", organizationId)`, `toErrorResponse`). **Run** the route test and `npx vitest run tests/security`. Expected: PASS.
- [ ] **Step 7: Stage.**

### Task 5: PRC license records

**Files:**
- Create: `src/server/db/models/professional-license-record.ts`, `src/domains/people/professional-license-record-service.ts`, `src/app/api/employees/[id]/prc-licenses/route.ts`, `src/app/api/employees/[id]/prc-licenses/[recordId]/route.ts`
- Modify: `src/server/db/models/index.ts`, `src/shared/validation/workforce.ts`
- Test: `tests/domains/people/professional-license-record-service.test.ts`, `tests/app/api/prc-license-routes.test.ts`

**Interfaces:**
- Consumes: `PrcProfessionService.assertValidCode(organizationId, code)`; the date helpers and `idNumberSchema` from Tasks 2 and 4 (extract the date-key validator from Task 4's service into `src/domains/people/valid-until.ts` as `cleanValidUntil(value: unknown): Date | undefined` and use it in both services).
- Produces: `ProfessionalLicenseRecordModel` (`organizationId`, `personId`, `professionCode`, `licenseNumber`, `validUntil?: Date`, timestamps; same index); `ProfessionalLicenseRecordService.listForEmployee`, `.create(input: { organizationId; employeeId; professionCode: string; licenseNumber: string; validUntil?: string }, actor)`, `.update(employeeId, recordId, organizationId, patch: { professionCode?; licenseNumber?; validUntil?: string | null }, actor)`, `.remove(...)` (same argument order as Task 4; list ordered by profession `sortOrder` then number); `ProfessionalLicenseRecordView = { id: string; professionCode: string; licenseNumber: string; validUntil: string | null }`; `toProfessionalLicenseRecordView`; the three schemas; routes under `/api/employees/[id]/prc-licenses`; audit actions `professional-license-record.*`.

- [ ] **Step 1: Write the failing service tests** with the same shape as Task 4 minus the other-name rules: a profession is required; a retired profession is kept on edit and refused on a switch; blank number refused; two licenses of one profession allowed; `validUntil` clears with `null`; scoping, `NotFoundError` cases and audit as in Task 4.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** (refactor `cleanValidUntil` out of Task 4's service first, re-run Task 4's test). **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Write the failing route tests** (same cases as Task 4). **Step 6: Implement** the routes and schemas; **run** them. Expected: PASS.
- [ ] **Step 7: Stage.**

### Task 6: Profile cards, dialogs and expiry chips

**Files:**
- Create: `src/domains/people/expiry-status.ts`, `src/app/(app)/people/[id]/expiry-chip.tsx`, `src/app/(app)/people/[id]/government-ids-card.tsx`, `government-id-dialog.tsx`, `prc-licenses-card.tsx`, `prc-license-dialog.tsx` (same folder)
- Modify: `src/app/(app)/people/[id]/page.tsx`
- Test: `tests/domains/people/expiry-status.test.ts`, `tests/app/government-ids-card.test.tsx`, `tests/app/government-id-dialog.test.tsx`, `tests/app/prc-licenses-card.test.tsx`, `tests/app/prc-license-dialog.test.tsx`

**Interfaces:**
- Consumes: the two views and routes from Tasks 4 and 5; `catalogOptions` and `catalogOptionName` from Task 3; `daysBetween` from `src/domains/dashboard/action-queue.ts` and `RISK_WINDOW_DAYS` from `compliance-risks.ts`.
- Produces: `expiryStatus(validUntilKey: string | null | undefined, todayKey: string): "expired" | "expiring" | "valid" | null` (`null` when there is no date; `expired` when before today; `expiring` when 0 to `RISK_WINDOW_DAYS` days away); `ExpiryChip({ validUntil, todayKey })` (renders nothing for `null` or `valid`; text "Expired" or "Expiring soon", test id `expiry-chip`); `GovernmentIdsCard({ organizationId, employeeId, employeeName?, records: GovernmentIdRecordView[], types: CatalogItem[], todayKey, canUpdate })` and `GovernmentIdDialog({ organizationId, employeeId, employeeName?, types, record? })`; `PrcLicensesCard({ ..., records: ProfessionalLicenseRecordView[], professions: CatalogItem[], todayKey, canUpdate })` and `PrcLicenseDialog`; `CatalogItem = { code: string; name: string; status?: string; sortOrder?: number }`. Test ids: `government-id-add-button`, `government-id-type`, `government-id-other-name`, `government-id-submit`, `government-id-edit-{id}`, `government-id-remove-{id}`, and the same with `prc-license-` (`prc-license-profession`).

- [ ] **Step 1: Write the failing tests:** `expiryStatus` for no date, yesterday (`expired`), today (`expiring`), day 30 (`expiring`), day 31 (`valid`); cards list rows with the type or profession name (a retired one still shows its name, an unknown code shows the code, an other-name shows the typed name), number, valid-until and a chip, an empty state, no controls without `canUpdate`; the ID dialog offers the catalog's active types plus "Other (type a name)", shows the name input only for "Other", sends `typeCode` or `otherTypeName` (never both), sends `validUntil: null` and the right blanks when editing, shows server errors, refuses a missing number before sending; the PRC dialog sends `professionCode`, `licenseNumber`, `validUntil`; remove asks to confirm then calls DELETE.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** by copying `education-background-card.tsx` and `education-record-dialog.tsx` (same `DataTable`, `OptionSelect`, `FormField`, `useFieldErrors`, `ConfirmDialog`, toast and `router.refresh()` patterns). Use an existing badge or text style for the chip (check `src/components/ui`). In `page.tsx`, load `GovernmentIdRecordService.listForEmployee`, `ProfessionalLicenseRecordService.listForEmployee` (through the `load(on("overview"), ...)` helper beside the education load) and the two catalogs' `listCurrent`, render both cards in Overview under the education card, and add `ExpiryChip` beside the PWD and Solo Parent lines from Task 2 using `localDateKey()`.
- [ ] **Step 4: Run** the five test files and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Stage.**

### Task 7: Dashboard alerts

**Files:**
- Create: `src/domains/people/id-expiry-service.ts`
- Modify: `src/domains/dashboard/compliance-risks.ts`, `src/app/(app)/dashboard/page.tsx`
- Test: `tests/domains/dashboard/person-id-risks.test.ts`, `tests/domains/people/id-expiry-service.test.ts`

**Interfaces:**
- Produces: `personIdRisks(items: { id: string; employeeId: string; employeeName: string; label: string; validKey: string }[], todayKey: string): ActionItem[]` in `compliance-risks.ts` (skips items more than `RISK_WINDOW_DAYS` away; kind `"person-id"`; title `"{label} expired: {employeeName}"` when past, else `"Renew {employeeName}'s {label}"`; detail `"Expired …"` or `"Expires …"` from `relativeDue`; `href` `/people/{employeeId}`; `actionLabel` "Open profile"; `urgency` from `urgencyFor(todayKey, validKey, 7, RISK_WINDOW_DAYS)`; `dueKey` the valid-until key; `id` `"person-id-" + item.id`); `IdExpiryService.listExpiring(organizationId: string, until: Date): Promise<{ id: string; employeeId: string; label: string; validKey: string }[]>` (the PWD and Solo Parent fields, government IDs and PRC licenses with `validUntil` on or before `until`, each fanned out to every employee record of that person; labels "PWD ID", "Solo Parent ID", the type name or typed name, and "PRC license ({profession name})"; capped at 200 per source).

- [ ] **Step 1: Write the failing tests:** `personIdRisks` returns a row for expired, for today, for day 30, none for day 31, orders nothing itself, collapses via the page's existing `collapseKind` (not tested here); the service returns items from all four sources, excludes records past `until`, excludes other organizations, returns one item per employee record of a rehired person, and uses the catalog name for labels (typed name for "other").
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the pure function beside `documentRisks`, and the service (one query per source, then one `EmployeeModel.find({ personId: { $in } })`). In `dashboard/page.tsx`, add `canReadEmployees ? IdExpiryService.listExpiring(organizationId, new Date(\`${addDays(todayKey, RISK_WINDOW_DAYS)}T23:59:59Z\`)) : null` to the existing `Promise.all` (the page already mirrors the documents line), then after the documents block keep only items whose `employeeId` is in the page's `staff` set, name them with `nameOf`, call `personIdRisks`, and push through `collapseKind(rows, ROWS_PER_KIND, ...)` with a summary row `{ id: "person-ids-many", kind: "person-id", title: "{count} employee IDs or licenses expired or expiring", href: "/people", actionLabel: "Open people" }`, like the documents block.
- [ ] **Step 4: Run** both test files and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Stage.**

### Task 8: Recycle bin, knowledge base, verification

**Files:**
- Modify: `src/domains/deletion/deletion-registry.ts`; knowledge files listed in Part 1 ("Knowledge files to update when built"); `docs/architecture/adr/ADR-060-year-end-tax-adjustment.md` (addendum)
- Test: `tests/domains/deletion/government-id-and-license-deletion.test.ts` (model on `education-deletion.test.ts`)

- [ ] **Step 1: Write the failing test:** deleting an employee moves their government-ID and PRC-license records to the recycle bin and restoring brings them back; another person's records are untouched.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement:** beside the education line in `planEmployee`, add two entries with labels "Government IDs" and "PRC licenses", filtered by `{ personId: person._id, organizationId }`. **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Update the knowledge files and ADR-060 addendum** (RDO and ZIP removed from the employee, 2316 columns dropped), update every touched file's "Last verified" line, add this plan to `knowledge/README.md` (Plans table, model count 63 to 66, catalog count 16 to 18, domain notes), and record in `known-gaps-and-mismatches.md`: the new numbers appear in audit snapshots, the catalog metadata limitation behind the fixed 30-day window, and the removed RDO/ZIP entry. Update this plan's status to "Built".
- [ ] **Step 6: Verify:** `npm run typecheck`; `npm run lint`; `(npm run test:ui; npm run test:domains; npm run test:core)`, reporting every failure by name. Expected: all new tests pass and no previously green test turns red. Then `npx tsx scripts/remove-employee-rdo-zip.ts` against a dev database and confirm the dry run reports what it would clear.
- [ ] **Step 7: Stage** the files by explicit path.

## Self-review

- Spec coverage: removal (Task 1), PWD and Solo Parent (2), catalogs (3), government IDs (4), PRC licenses (5), screens and chips (6), alerts (7), recycle bin and docs (8). Non-goals have no task.
- Types: `GovernmentIdRecordView`, `ProfessionalLicenseRecordView`, `CatalogItem`, `expiryStatus`, `personIdRisks` and `IdExpiryService.listExpiring` are named identically wherever they are used; both services take `(employeeId, recordId, organizationId, patch, actor)` in that order, as `EducationRecordService` does.

---

## Build record (2026-11-16)

All eight tasks were built inline on `main`, test-first (each new test was run and seen failing before its code), and left uncommitted and unstaged-by-others. Rulings made while building (deviations from the plan, each small):

- **Card title.** The profile already has a card titled "Government IDs" (SSS, PhilHealth, Pag-IBIG, TIN; anchor `#government-ids`). The new card is titled **"Additional government IDs"** (anchor `#additional-government-ids`) so the two don't clash. The plan's UI sections said "Government IDs card". Cost if wrong: wording only.
- **No `catalog-option-name.ts`.** The plan allowed reusing the existing `catalogChoiceOptions` / `catalogChoiceName` (`catalog-choice-options.ts`) if they already did the job. They did, so no new file was added.
- **`cleanValidUntil` lives in `valid-until.ts` from Task 4**, not extracted in Task 5. Both services use it; no behavior change.
- **2316 header test placement.** The "no employee RDO or ZIP column" assertions sit in the existing `year-end-run.test.ts` (which already builds the 2316 table from real fixtures) instead of the new `person-rdo-zip-removed.test.ts`. That file checks the model and the schema.
- **Migration logic in a domain file.** `scripts/remove-employee-rdo-zip.ts` is a thin wrapper over `src/domains/people/remove-employee-rdo-zip.ts` so it can be tested with the in-memory database (the existing backfill scripts do the same).
- **Profile PWD / Solo Parent lines** sit in the Government IDs card (where the removed RDO/ZIP line was) rather than the personal-details block.
- Known follow-ups are recorded as gaps B29.

**Final review (2026-11-16, fresh reviewer, no Critical findings).** Fixed test-first (each test seen failing first): (1) the dashboard's per-source cap of 200 could be used up by former staff's old dates, hiding a current employee's, so `IdExpiryService.listExpiring` now takes `{ employeeIds }` (current staff), reads only their items and sorts newest-first; (2) a rehired person got two rows when no employment status is flagged as active headcount (everyone counts as staff), so with `employeeIds` the service keeps the newest employee record per person; (3) the PWD and Solo Parent validity dates used `z.coerce.date()`, which stored `null` as 1970-01-01 and "2027-02-30" as March 2, so they now use `validUntilDateSchema`. Deferred minors, now in gaps B29: audit-view labels for the new keys; clearing only a PWD number leaves the date and its alert; no index on `validUntil`. Not judged by the reviewer: whether PWD and Solo Parent data should be visible to everyone with `employees.read` (it follows the existing SSS and TIN exposure).

**Follow-up (2026-11-16, owner asked to fix the three deferred minors).** Done test-first: audit-view labels for the new fields (`audit-fields.ts`; test `tests/app/audit-fields-ids.test.ts`); a PWD or Solo Parent validity date now requires its number (the design had allowed a date alone; the owner's fix is to refuse it, so a cleared number can't leave a stale date and alert); indexes on `validUntil` (record models) and on the person's two dates. `focusInvalidField` now guards `scrollIntoView` like its sibling `focusControl`, so client-side field errors don't throw in jsdom. This supersedes the design's note that a date without a number is allowed.
