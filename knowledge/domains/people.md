# People

**Purpose:** the Person record: a real human's identity and personal details (name, contact, gender, birth date, statutory IDs), kept apart from the User account and the Employee record, plus the read-only "other modules' records" loaders that feed the profile tabs.
**Governing docs:** ADR-003 (User vs Person vs Employee), ADR-019 (roster fields kept on the Person/Employment split), ADR-047 (everything about an employee on their profile), ARCHITECTURE.md § Identity model (ADR-003) and § Workforce (Phase 3), ENGINEERING.md § 13 (People model), § 35 (audit), § 37 (domain services).
**Services:**
- `src/domains/people/person-service.ts`: `PersonService.create(input, actor)`, `PersonService.update(personId, organizationId, patch, actor)`. Empty string in a patch means `$unset`, not `""` (lines 90-99). Audit `person.created` / `person.updated` with before/after (lines 53-60, 108-116).
- `src/domains/people/employee-records.ts`: `EmployeeRecords.payslips`, `travelOrders`, `offboarding`, `reviewCycleNames`. Read-only; each loads only when its profile tab opens (comment at lines 126-130). `offboarding` joins `ClearanceCaseModel`, `FinalSettlementModel` and `SeparationTypeService.listCurrent`; `payslips` joins `PayrollRecordModel` and `PayrollRunModel` and drops cancelled runs.

**Models:**
- `src/server/db/models/person.ts` (`PersonModel`): `organizationId`, names, `email`, `phone`, `gender` enum Male/Female, `birthDate`, `address`, `remarks` (max `REMARKS_MAX_LENGTH`), `educationLevelCode` (code of an `education-levels` catalog item, checked by `PersonService` against the active catalog before any write), `sssNumber`, `philHealthNumber`, `pagIbigNumber`, `tinNumber`, `metadata`. No hidden plugin.
- Educational background: `src/domains/people/education-record-service.ts` (`EducationRecordService.listForEmployee/create/update/remove`, `toEducationRecordView`) over `src/server/db/models/education-record.ts` (`EducationRecord`: `personId`, `levelCode`, `school`, `course?`, `yearGraduated?`; several per level allowed). Routes `POST /api/employees/[id]/education`, `PATCH`/`DELETE .../[recordId]` (`employees.update`). Card: `src/app/(app)/people/[id]/education-background-card.tsx`. Rules: entry must belong to the employee in the URL; level checked against the active catalog only when it changes; year 1900..next year; blank course/year stored as absent; employee deletion moves the entries to the recycle bin with the employee and restores them (deletion-registry `planEmployee`); the level is checked on update only when it changes, since the edit form re-sends it; removal is a plain delete, audited (`education-record.created/updated/removed`).
- Read through: `EmployeeModel`, `EmployeeAssignmentModel`, `TravelOrderModel`, `ClearanceCaseModel`, `FinalSettlementModel`, `PayrollRecordModel`, `PayrollRunModel`, `ReviewCycleModel` (`src/server/db/models/index.ts`).

**Routes:**
- `src/app/api/employees/[id]/route.ts`: `PATCH` calls `PersonService.update` then `EmployeeService.update` (two separate writes). Permission `employees.update`.
- Person creation happens only inside `HireService.hire` (`src/app/api/employees/route.ts` POST), not through its own route.
- No route calls `EmployeeRecords` directly; they are called from the profile page (`src/app/(app)/people/[id]/page.tsx`).

**Pages:**
- `src/app/(app)/people/[id]/page.tsx` (profile, uses `EmployeeRecords` and `PersonService` data), `records-tabs.tsx` (tabs that show other modules' records for one person), `profile-format.tsx`, `edit-employee-dialog.tsx` (calls `PATCH /api/employees/[id]`).
- `src/app/(app)/people/new/hire-form.tsx` creates a Person as part of a hire.

**Tests:**
- `tests/domains/people/person-service.test.ts`
- No test file covers `employee-records.ts`.

**Rules a change must respect:**
- A Person is never edited through the Employee record. Identity fields go through `PersonService.update` (`person-service.ts`, `update`), which scopes by `organizationId` and throws `NotFoundError` otherwise.
- Clearing a field must send `""`, which `PersonService.update` converts to `$unset`. Writing `""` with `$set` would leave the old value (comment at `person-service.ts` lines 90-92). Keep the `clearable` wrapper in `updateEmployeeProfileSchema` in step with this.
- Every Person write is audited, with before and after snapshots (`person-service.ts`, `AuditService.record`).
- Statutory IDs (`sssNumber`, `philHealthNumber`, `pagIbigNumber`, `tinNumber`) are format-validated at the service boundary (`src/shared/validation/shared.ts`, as noted in `src/server/db/models/person.ts` lines 17-18), not in the schema. Any new write path must go through the same validators.
- `EmployeeRecords` loaders must filter on `organizationId` (every query in `employee-records.ts` does). Keep that rule for any new loader.
- `Person` has no `hiddenFromOthers` field or plugin. Hiding an employee hides the Employee record only (see `visibility.md`).

**Known gaps / mismatches:**
- `PersonService.update` writes `before` and `after` to the audit log, and both contain the statutory IDs and birth date in plain text (`person-service.ts` lines 74-88, 108-116). Anyone with `audit-logs.read` (`scripts/seed.ts`) can read them. Check this against ENGINEERING.md § 35 and any data-minimisation policy.
- `PersonService.create` records only names in its audit `after` (`person-service.ts` line 59). The create and update audit payloads are inconsistent.
- The `PATCH /api/employees/[id]` route runs the Person and Employee updates as two writes with no transaction (`src/app/api/employees/[id]/route.ts`). A failure between them leaves a partial edit. Low severity; no ADR covers it.
- `EmployeeRecords.payslips` and `offboarding` run unbounded `find`s with no limit. Acceptable at current scale; not covered by a test.

**Last verified:** 6587050.
