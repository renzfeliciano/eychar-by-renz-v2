# Workforce (employee lifecycle)

**Purpose:** the employee record and its effective-dated history: hire, employment type and status (including terms changes and termination), and the assignment (position, unit, project, location) with transfer. Roster paging, export and the org chart are in `workforce-roster-org-chart.md`.
**Governing docs:** ADR-005 (assignment and transfer), ADR-019 (roster fields), ADR-041 (transactions; hiring deliberately not atomic), ADR-047 (profile), ADR-052 (changing employment terms), ARCHITECTURE.md § Workforce (Phase 3), ENGINEERING.md § 12 (position is not reporting line), § 13 (people), § 14 (employment), § 15-16 (assignments and history), § 27 (effective dating), § 33 (transactions), § 37 (domain services), § 58-60 (domain, historical and authorization tests).
**Services:**
- `src/domains/workforce/employee-service.ts`: `EmployeeService.create`, `update` (employee number only), `listWithCurrentStatus(orgId)` (wrapped in React `cache`, one read per render), `getDetail(employeeId, orgId)`. Module helper `latestPerEmployee`.
- `src/domains/workforce/hire-service.ts`: `HireService.hire(input, actor)` runs `PersonService.create`, `EmployeeService.create`, `EmploymentService.create`, `EmployeeAssignmentService.create` in sequence, not in a transaction.
- `src/domains/workforce/employment-service.ts`: `EmploymentService.create`, `terminate(id, orgId, patch, actor)`, `changeTerms(employeeId, orgId, input, actor)` (keeps the same employment, appends `termsHistory`), `correctEnding(employeeId, orgId, patch, actor)` (reason, last day or note of an ended employment, in place), `reinstate(employeeId, orgId, {reason}, actor)` (reopens the same employment), `getEndingState(employeeId, orgId)` (what blocks reinstating or locks the last day), `getCurrent(employeeId)`, `isActiveStatus(orgId, status)` (reads the status catalog flag `isActiveHeadcount`, falls back to `status !== "terminated"`).
- `src/domains/workforce/employee-assignment-service.ts`: `EmployeeAssignmentService.create` (first assignment), `transfer(employeeId, orgId, fields, actor)` (closes the open row and creates a new one in a transaction, ADR-041), `getCurrent`, `getAsOf(employeeId, date)`, `getHistory(employeeId, orgId)`.
- `src/domains/workforce/assignments-as-of.ts`: `assignmentsAsOf(pairs)`, bulk version of `getAsOf` for many (employee, date) pairs. Used by `src/domains/attendance/attendance-service.ts`.
- `src/domains/workforce/contract-terms.ts` (pure): `requiresEndOfContract(typeItem)`, `contractEndApplies(code, types)`, `typesWithoutContractEnd(types)`, `contractEndOf(employment, types)`. Reads the `requiresEndOfContract` flag from the EmploymentType catalog (`src/domains/catalog/catalog-flags.ts`).
- `src/domains/workforce/profile-summary.ts` (pure): `documentExpiry`, `missingGovernmentIds`, `profileAttention(input, now)` (the profile's "needs attention" list, most urgent first).
- `src/domains/workforce/headcount.ts`: `loadHeadcount(orgId)` (current staff by unit, position, project, location). Used by the organization pages.

**Models:**
- `src/server/db/models/employee.ts` (`EmployeeModel`): `personId`, `employeeNumber` (unique per org when present, partial index), `excludedFromSchedule`. Pure identity, no status field. Hidden plugin applied.
- `src/server/db/models/employment.ts` (`EmploymentModel`): `employmentType` and `status` as catalog codes (validated in the service, not an enum), `effectiveFrom`, `effectiveTo`, `endOfContract`, `terminationReason`, `termsHistory[]` (ADR-052). Index `(employeeId, effectiveFrom)`. No hidden plugin.
- `src/server/db/models/employee-assignment.ts` (`EmployeeAssignmentModel`): `positionId`, `organizationUnitId`, `projectId`, `locationId`, `effectiveFrom`, `effectiveTo`, `status` (`active` / `inactive`). No `reportsToEmployeeId` field. No hidden plugin.
- `src/server/db/models/person.ts` (`PersonModel`): see `people.md`.
- Catalogs read: `EmploymentType`, `EmploymentStatus` (`src/domains/catalog/employment-type-service.ts`, `employment-status-service.ts`).

**Routes:**
- `src/app/api/employees/route.ts`: GET (`employees.read`, returns the full roster, see gaps), POST (`employees.create`, `HireService.hire`, returns 201).
- `src/app/api/employees/[id]/route.ts`: GET (`employees.read`, `EmployeeService.getDetail`), PATCH (`employees.update`, `PersonService.update` then `EmployeeService.update`).
- `src/app/api/employees/[id]/employment/route.ts`: POST (`employees.update`, `EmploymentService.create`), PATCH (`employees.update`, end the current employment). `employment/ending/route.ts`: PATCH (`employees.update`, correct how it ended). `employment/reinstate/route.ts`: POST (`employees.update`, reverse an ending).
- `src/app/api/employees/[id]/employment/terms/route.ts`: PATCH (`employees.update`, `changeTerms`).
- `src/app/api/employees/[id]/assignments/route.ts`: GET (`employees.read`, history), POST (`employees.update`, `transfer`).
- `src/app/api/employees/export/route.ts`: GET (`employees.read`, roster export, see the roster file).
- Related: `src/app/api/employee-accounts/` (identity domain) and `src/app/api/employees/[id]/documents/` (documents domain) hang off the same employee.

**Pages:**
- `src/app/(app)/people/new/page.tsx` and `hire-form.tsx` (POST `/api/employees`).
- `src/app/(app)/people/[id]/page.tsx` (profile). Tabs: `job-tab.tsx` (Job and history), `records-tabs.tsx`, `profile-format.tsx`, `edit-employee-dialog.tsx` (PATCH `/api/employees/[id]`), `change-employment-dialog.tsx` (PATCH `.../employment/terms`), `transfer-form.tsx` (POST `.../assignments`), `end-employment-dialog.tsx` (`.../employment`), `edit-ending-dialog.tsx` (`.../employment/ending`), `reinstate-dialog.tsx` (`.../employment/reinstate`), `documents-tab.tsx` (uses `profileAttention`), `leave-tab.tsx`, `assets-tab.tsx`.
- `src/app/(app)/dashboard/page.tsx`: active headcount and probation rows (uses `EmployeeService`, `EvaluationFollowUpService`).

**Tests:**
- `tests/domains/workforce/employee-service.test.ts`, `employment-service.test.ts`, `employee-assignment-service.test.ts` (includes the 2025/2026 historical case, ENGINEERING.md § 59), `hire-service.test.ts`, `contract-terms.test.ts`, `profile-summary.test.ts`, `headcount.test.ts`
- `tests/app/change-employment-dialog.test.tsx`, `tests/app/api/employment-and-evaluation-routes.test.ts` (employment routes)
- `tests/security/races-2026-10.test.ts` (transfer races), `tests/security/scan-2026-10.test.ts` (both import `EmployeeAssignmentService`)
- No test imports `assignments-as-of.ts` directly; `attendance-service.ts` is its only caller.

**Rules a change must respect:**
- Employee is identity only. Current status comes from the latest open Employment, never a flag on Employee (`employee.ts` header comment, lines 4-6).
- Assignments are never edited in place. A transfer closes the open row (`effectiveTo`) and inserts a new one, in one transaction (`employee-assignment-service.ts`, `transfer`, lines 111-166; ADR-041). The close is conditional on the row still being open, so a racing second transfer fails (lines 155-160).
- A transfer inherits fields it does not name from the open assignment (lines 125-134). Position and project are required on every assignment (lines 136-141), checked before the open row is touched.
- Every referenced position, unit, project and location must belong to the same organization (`validateAssignmentRefs`, lines 39-77).
- No reporting line on assignments. Reporting comes from the org chart (ENGINEERING.md § 18; ADR-046).
- Employment changes append to `termsHistory` and keep `effectiveFrom` (hire date). `changeTerms` rejects effective dates before hire, end dates before the change, and no-op changes (`employment-service.ts`, lines 360-413).
- Whether an end date counts is the type's `requiresEndOfContract` catalog flag, not a list of codes (`contract-terms.ts`, header and lines 358-384). Keep that.
- Active headcount is the status catalog flag `isActiveHeadcount`, with the literal `"terminated"` as fallback (`employment-service.ts` `isActiveStatus`, lines 422-436). Use `isActiveStatus` or `loadCurrentStaffCheck`, not a new literal.
- Every write is audited with before and after (`employee.created`, `employment.created`, `employment.terms_changed`, `employee-assignment.transferred`, and so on).
- Ending can be corrected or reversed (ADR-055): `correctEnding` locks the last day once a non-cancelled final settlement exists from this employment; `reinstate` is refused when nothing has ended, final pay was disbursed, or a clearance is open. Both append to `Employment.endingHistory`. Reinstating clears the end date, so a draft payroll run covering the gap counts those days as employed.
- Termination (`EmploymentService.terminate`) ends the employment only. It does not close the open `EmployeeAssignment` (see gaps).
- Historical reads use `effectiveFrom` / `effectiveTo` with inclusive bounds (`getAsOf`, `assignmentsAsOf`).

**Known gaps / mismatches:**
- **A hire is not atomic, and validation runs after earlier writes.** `HireService.hire` creates Person and Employee before `EmploymentService.create` checks the employment type against the catalog (`hire-service.ts` lines 183-233; `employment-service.ts` `assertValidCode`). An unknown `employmentType`, or a duplicate `employeeNumber` (`EmployeeService.create` throws `ConflictError` after the Person is written), leaves an orphan Person (and Employee). The test `hire-service.test.ts` line 41 only asserts the rejection, not the leftover rows. ADR-041 accepts a partial hire "if ever seen" and ENGINEERING.md § 33 does not list hiring, but this failure is reachable from ordinary bad input, not just a crash.
- **Termination leaves the assignment open.** `employment.terminate` sets `effectiveTo` on Employment only, and nothing in `final-settlement-service.ts` or the clearance code closes `EmployeeAssignment`. A terminated employee keeps an open assignment row. Headcount and evaluator candidates filter by employment status, so they are protected, but any code that counts position occupancy from assignments alone is not (`employee-assignment-service.ts`, `getCurrent`, `getAsOf`). Verify.
- `EmployeeAssignmentService.transfer` does not check the new `effectiveFrom` against the open assignment's start. A date earlier than that start yields a closed row whose `effectiveTo` precedes its `effectiveFrom`. `transferAssignmentSchema` (`src/shared/validation/workforce.ts` lines 58-62) has no refinement. `changeTerms` does check this (`employment-service.ts` line 379).
- `EmploymentService.create` and `hire` allow `employmentType` values that the catalog marks `requiresEndOfContract` only when `endOfContract` is supplied. The check sits after the Employee write (same ordering issue as above).
- `ARCHITECTURE.md` § Workforce says `EmployeeAssignment` has `reportsToEmployeeId?` and `Employment.status` is `active|on_leave|terminated`. Code: no `reportsToEmployeeId` on the model (only read from the raw collection for legacy charts in `org-chart-service.ts` lines 77-91); status is a catalog code, seeded as `active`, `on_leave`, `terminated`, `resigned`, `awol` (`scripts/seed.ts` lines 522-526).
- `ENGINEERING.md` § 12 says `EmployeeAssignment.reportsToEmployeeId` is "acceptable", but § 18 says "do not reintroduce one" (ADR-046). The two sections disagree; § 18 and the code agree.
- `EmployeeService.getDetail` returns the latest Employment by `effectiveFrom` with no open-status filter, while the terminate route (`getCurrent`) and `changeTerms` use the open filter. Consistent for now, but a profile can show a closed record as "current".
- `PATCH /api/employees/[id]` writes Person and Employee as two separate operations (see `people.md`).

**Last verified:** 6587050.
