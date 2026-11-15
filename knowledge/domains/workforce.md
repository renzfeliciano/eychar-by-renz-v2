# Workforce: employee lifecycle, roster, export, headcount and org chart

**Purpose (Part 1, lifecycle):** the employee record and its effective-dated history: hire, employment type and status (including terms changes and termination), and the assignment (position, unit, project, location) with transfer. Roster paging, export and the org chart are in Part 2 below.
**Purpose (Part 2, roster and org chart):** the read side of the workforce: the paged, searched and sorted roster for `/people` and its summary strip, the audited roster export, headcount for the organization screens, and the org chart HR draws on a canvas (ADR-046).
**Governing docs (Part 1):** ADR-005 (assignment and transfer), ADR-019 (roster fields), ADR-041 (transactions; hiring deliberately not atomic), ADR-047 (profile), ADR-052 (changing employment terms), ARCHITECTURE.md § Workforce (Phase 3), ENGINEERING.md § 12 (position is not reporting line), § 13 (people), § 14 (employment), § 15-16 (assignments and history), § 27 (effective dating), § 33 (transactions), § 37 (domain services), § 58-60 (domain, historical and authorization tests).
**Governing docs (Part 2):** ADR-046 (org chart is a drawn canvas, supersedes ADR-009), ADR-009 (superseded; its projection design still described in ARCHITECTURE.md), ADR-019 (roster fields), ADR-044 (paging and counting in the database), ARCHITECTURE.md § People roster paging, § Organizational chart (Phase 4, ADR-009; **stale**, see gaps), ENGINEERING.md § 18 (org chart is the source of truth for reporting lines), § 36 (API architecture), § 58 (domain test).
**Last verified:** 6587050; roster API trimmed 2026-11-15. Merged from the former `workforce.md` and `workforce-roster-org-chart.md` on 2026-11-15.

---

## Part 1: Employee lifecycle (hire, employment, assignments, transfers)

### Services
- `src/domains/workforce/employee-service.ts`: `EmployeeService.create`, `update` (employee number only), `listWithCurrentStatus(orgId)` (wrapped in React `cache`, one read per render), `getDetail(employeeId, orgId)`. Module helper `latestPerEmployee`.
- `src/domains/workforce/hire-service.ts`: `HireService.hire(input, actor)` runs `PersonService.create`, `EmployeeService.create`, `EmploymentService.create`, `EmployeeAssignmentService.create` in sequence, not in a transaction.
- `src/domains/workforce/employment-service.ts`: `EmploymentService.create`, `terminate(id, orgId, patch, actor)`, `changeTerms(employeeId, orgId, input, actor)` (keeps the same employment, appends `termsHistory`), `correctEnding(employeeId, orgId, patch, actor)` (reason, last day or note of an ended employment, in place), `reinstate(employeeId, orgId, {reason}, actor)` (reopens the same employment), `getEndingState(employeeId, orgId)` (what blocks reinstating or locks the last day), `getCurrent(employeeId)`, `isActiveStatus(orgId, status)` (reads the status catalog flag `isActiveHeadcount`, falls back to `status !== "terminated"`).
- `src/domains/workforce/employee-assignment-service.ts`: `EmployeeAssignmentService.create` (first assignment), `transfer(employeeId, orgId, fields, actor)` (closes the open row and creates a new one in a transaction, ADR-041), `getCurrent`, `getAsOf(employeeId, date)`, `getHistory(employeeId, orgId)`.
- `src/domains/workforce/assignments-as-of.ts`: `assignmentsAsOf(pairs)`, bulk version of `getAsOf` for many (employee, date) pairs. Used by `src/domains/attendance/attendance-service.ts`.
- `src/domains/workforce/contract-terms.ts` (pure): `requiresEndOfContract(typeItem)`, `contractEndApplies(code, types)`, `typesWithoutContractEnd(types)`, `contractEndOf(employment, types)`. Reads the `requiresEndOfContract` flag from the EmploymentType catalog (`src/domains/catalog/catalog-flags.ts`).
- `src/domains/workforce/profile-summary.ts` (pure): `documentExpiry`, `missingGovernmentIds`, `profileAttention(input, now)` (the profile's "needs attention" list, most urgent first).


### Models
- `src/server/db/models/employee.ts` (`EmployeeModel`): `personId`, `employeeNumber` (unique per org when present, partial index), `excludedFromSchedule`. Pure identity, no status field. Hidden plugin applied.
- `src/server/db/models/employment.ts` (`EmploymentModel`): `employmentType` and `status` as catalog codes (validated in the service, not an enum), `effectiveFrom`, `effectiveTo`, `endOfContract`, `terminationReason`, `termsHistory[]` (ADR-052). Index `(employeeId, effectiveFrom)`. No hidden plugin.
- `src/server/db/models/employee-assignment.ts` (`EmployeeAssignmentModel`): `positionId`, `organizationUnitId`, `projectId`, `locationId`, `effectiveFrom`, `effectiveTo`, `status` (`active` / `inactive`). No `reportsToEmployeeId` field. No hidden plugin.
- `src/server/db/models/person.ts` (`PersonModel`): see `people.md`.
- Catalogs read: `EmploymentType`, `EmploymentStatus` (`src/domains/catalog/employment-type-service.ts`, `employment-status-service.ts`).


### Routes
- `src/app/api/employees/route.ts`: GET (`employees.read`; roster trimmed by `roster-api-view.ts` to name and work email only, no statutory IDs, birth date, address, phone or remarks), POST (`employees.create`, `HireService.hire`, returns 201).
- `src/app/api/employees/[id]/route.ts`: GET (`employees.read`, `EmployeeService.getDetail`), PATCH (`employees.update`, `PersonService.update` then `EmployeeService.update`).
- `src/app/api/employees/[id]/employment/route.ts`: POST (`employees.update`, `EmploymentService.create`), PATCH (`employees.update`, end the current employment). `employment/ending/route.ts`: PATCH (`employees.update`, correct how it ended). `employment/reinstate/route.ts`: POST (`employees.update`, reverse an ending).
- `src/app/api/employees/[id]/employment/terms/route.ts`: PATCH (`employees.update`, `changeTerms`).
- `src/app/api/employees/[id]/assignments/route.ts`: GET (`employees.read`, history), POST (`employees.update`, `transfer`).
- `src/app/api/employees/export/route.ts`: GET (`employees.read`, roster export, see the roster file).
- Related: `src/app/api/employee-accounts/` (identity domain) and `src/app/api/employees/[id]/documents/` (documents domain) hang off the same employee.


### Pages
- `src/app/(app)/people/new/page.tsx` and `hire-form.tsx` (POST `/api/employees`).
- `src/app/(app)/people/[id]/page.tsx` (profile). Tabs: `job-tab.tsx` (Job and history), `records-tabs.tsx`, `profile-format.tsx`, `edit-employee-dialog.tsx` (PATCH `/api/employees/[id]`), `change-employment-dialog.tsx` (PATCH `.../employment/terms`), `transfer-form.tsx` (POST `.../assignments`), `end-employment-dialog.tsx` (`.../employment`), `edit-ending-dialog.tsx` (`.../employment/ending`), `reinstate-dialog.tsx` (`.../employment/reinstate`), `documents-tab.tsx` (uses `profileAttention`), `leave-tab.tsx`, `assets-tab.tsx`.
- `src/app/(app)/dashboard/page.tsx`: active headcount and probation rows (uses `EmployeeService`, `EvaluationFollowUpService`).


### Tests
- `tests/domains/workforce/employee-service.test.ts`, `employment-service.test.ts`, `employee-assignment-service.test.ts` (includes the 2025/2026 historical case, ENGINEERING.md § 59), `hire-service.test.ts`, `contract-terms.test.ts`, `profile-summary.test.ts`, `headcount.test.ts`
- `tests/app/change-employment-dialog.test.tsx`, `tests/app/api/employment-and-evaluation-routes.test.ts` (employment routes)
- `tests/security/races-2026-10.test.ts` (transfer races), `tests/security/scan-2026-10.test.ts` (both import `EmployeeAssignmentService`)
- No test imports `assignments-as-of.ts` directly; `attendance-service.ts` is its only caller.


### Rules a change must respect
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


### Known gaps / mismatches
- **A hire is not atomic, and validation runs after earlier writes.** `HireService.hire` creates Person and Employee before `EmploymentService.create` checks the employment type against the catalog (`hire-service.ts` lines 183-233; `employment-service.ts` `assertValidCode`). An unknown `employmentType`, or a duplicate `employeeNumber` (`EmployeeService.create` throws `ConflictError` after the Person is written), leaves an orphan Person (and Employee). The test `hire-service.test.ts` line 41 only asserts the rejection, not the leftover rows. ADR-041 accepts a partial hire "if ever seen" and ENGINEERING.md § 33 does not list hiring, but this failure is reachable from ordinary bad input, not just a crash.
- **Termination leaves the assignment open.** `employment.terminate` sets `effectiveTo` on Employment only, and nothing in `final-settlement-service.ts` or the clearance code closes `EmployeeAssignment`. A terminated employee keeps an open assignment row. Headcount and evaluator candidates filter by employment status, so they are protected, but any code that counts position occupancy from assignments alone is not (`employee-assignment-service.ts`, `getCurrent`, `getAsOf`). Verify.
- `EmployeeAssignmentService.transfer` does not check the new `effectiveFrom` against the open assignment's start. A date earlier than that start yields a closed row whose `effectiveTo` precedes its `effectiveFrom`. `transferAssignmentSchema` (`src/shared/validation/workforce.ts` lines 58-62) has no refinement. `changeTerms` does check this (`employment-service.ts` line 379).
- `EmploymentService.create` and `hire` allow `employmentType` values that the catalog marks `requiresEndOfContract` only when `endOfContract` is supplied. The check sits after the Employee write (same ordering issue as above).
- `ARCHITECTURE.md` § Workforce says `EmployeeAssignment` has `reportsToEmployeeId?` and `Employment.status` is `active|on_leave|terminated`. Code: no `reportsToEmployeeId` on the model (only read from the raw collection for legacy charts in `org-chart-service.ts` lines 77-91); status is a catalog code, seeded as `active`, `on_leave`, `terminated`, `resigned`, `awol` (`scripts/seed.ts` lines 522-526).
- `ENGINEERING.md` § 12 says `EmployeeAssignment.reportsToEmployeeId` is "acceptable", but § 18 says "do not reintroduce one" (ADR-046). The two sections disagree; § 18 and the code agree.
- `EmployeeService.getDetail` returns the latest Employment by `effectiveFrom` with no open-status filter, while the terminate route (`getCurrent`) and `changeTerms` use the open filter. Consistent for now, but a profile can show a closed record as "current".
- `PATCH /api/employees/[id]` writes Person and Employee as two separate operations (see `people.md`).

---

## Part 2: Roster, export, headcount and org chart

### Services
- `src/domains/workforce/employee-roster-service.ts`:
  - `EmployeeRosterService.page(orgId, query)`: one `aggregate` with `$lookup` joins for person, latest employment and latest assignment, then `$match` for filters, then `$facet` for `rows` (sort, skip, limit, projection) and `total`. Search covers employee number, full name, and positions matching `q`. Collation `en`, strength 2.
  - `EmployeeRosterService.summary(orgId, activeCodes, now, typesWithoutEnd)`: counts only. `statusCounts`, `headcount`, `newHires` (90 days), `endingSoon` (30 days), `missingIds`.
  - `EmployeeRosterService.exportRows(orgId, lookups, employmentType)`: full export rows (names, contact, statutory IDs, age, length of service) built from `EmployeeService.listWithCurrentStatus` in memory, sorted by name.
- `src/domains/workforce/employee-service.ts`: `EmployeeService.listWithCurrentStatus(orgId)`: the whole roster with latest employment and assignment, joined in application code. Wrapped in React `cache` (one read per server render). Used by `org-chart-service`, `headcount`, `exportRows`, the dashboard and `GET /api/employees`.
- `src/domains/workforce/org-chart-service.ts`:
  - `OrgChartService.get(orgId)`: the saved chart, minus cards of deleted employees and their lines. Before the first save, builds a starting layout from the legacy `reportsToEmployeeId` values read straight from the collection (lines 76-96), then `arrange`s it.
  - `OrgChartService.save(input, actor)`: `chartProblems` check, every person card must be an employee of the org, upsert of the single chart per org, audit `org-chart.updated`.
  - `OrgChartService.newKey()`.
- `src/domains/workforce/org-chart-tree.ts` (pure, shared by server and browser): `chartProblems(nodes, edges)`, `canLink(edges, parent, child)`, `link(edges, parent, child)`, `arrange(nodes, edges)`, constants `CARD_WIDTH`, `CARD_HEIGHT`.
- `src/domains/workforce/headcount.ts`: `loadHeadcount(orgId)` (current staff by unit, position, project, location; unassigned counts). Consumed by `organization/positions`, `projects`, `units`, `locations` pages.


### Models
- `src/server/db/models/org-chart.ts` (`OrgChartModel`): `nodes[]` (`key`, `type` person or group, `employeeId`, `label`, `color`, `x`, `y`), `edges[]` (`from` = parent, `to` = child), `updatedBy`. Unique index on `organizationId`.
- Read: `EmployeeModel`, `EmploymentModel`, `EmployeeAssignmentModel`, `PersonModel` (`src/server/db/models/*.ts`). Position and project names come from `PositionService.listCurrent`, `ProjectService.listCurrent`, and `EmploymentStatusService.listCurrent`.


### Routes
- `src/app/api/employees/route.ts` GET: full roster, unpaged (`employees.read`). See gaps.
- `src/app/api/employees/export/route.ts` GET: `employees.read`, `enforceRateLimit("export", userId)`, `auditExport` action `employees.exported` (lines 21, 38).
- `src/app/api/organization-chart/route.ts`: GET (`employees.read`, `OrgChartService.get`), PUT (`org-chart.update`, `OrgChartService.save`).


### Pages
- `src/app/(app)/people/page.tsx`: calls `EmployeeRosterService.page` (lines 81, 90) and `summary` (line 88). Components: `people-filters.tsx`, `people-export-actions.tsx` (GET `/api/employees/export`), `people-print-report.tsx`.
- `src/app/(app)/organization/chart/page.tsx` and `org-chart-canvas.tsx`: saves with PUT `/api/organization-chart` (line 275). Uses `canLink` before drawing a link (line 198).
- `src/app/(app)/organization/positions/page.tsx` also lists vacant positions, which the ARCHITECTURE org-chart section describes as a projection feature.


### Tests
- `tests/domains/workforce/employee-roster-service.test.ts`
- `tests/domains/workforce/org-chart-service.test.ts`, `org-chart-tree.test.ts`
- `tests/domains/workforce/headcount.test.ts`
- `tests/domains/deletion/deletion-service.test.ts` (org chart is in the deletion registry, `src/domains/deletion/deletion-registry.ts`)
- No test for `GET /api/employees/export` or `/api/employees` route handlers was found by grep (`tests/app/api/route-handlers.test.ts` may cover them; not checked).


### Rules a change must respect
- The roster page is paged, searched and sorted in the database. Do not load the whole organization for a page view (ARCHITECTURE.md § People roster paging; comment `employee-roster-service.ts` lines 303-306).
- The page query projects only what the table shows: names, email, birth date and remarks (`employee-roster-service.ts` lines 342-352). Contact details and statutory IDs leave the database only through the export, which is permission-checked, rate-limited and audited (lines 411-416; `export/route.ts`). Keep that split.
- The summary returns counts only, with no names or IDs (lines 364-368).
- The org chart is a forest: one parent per card, no loops, every card an employee of this org or a group (`chartProblems`, `save`). `canLink` blocks cycles in the browser. Validate on both sides (ENGINEERING.md § 18).
- Card details (name, position, project) come from live records, never stored on the chart (`OrgChartService.get`, `people` mapping).
- Do not add a `reportsToEmployeeId` write path (ENGINEERING.md § 18; ADR-046). The legacy read in `get` exists only for first-visit layouts.
- Headcount counts current staff only, using the status catalog flag (`loadHeadcount`, `isCurrentStaff`). Use the same helper for any new count.
- `arrange` keeps card keys and only changes x and y (`org-chart-tree.ts` `arrange`).


### Known gaps / mismatches
- **`GET /api/employees` returns the entire roster with no paging and no audit entry**, including `sssNumber`, `philHealthNumber`, `pagIbigNumber`, `tinNumber`, `birthDate`, `remarks` and contact details (`employee-service.ts` `loadWithCurrentStatus`, `ROSTER_PERSON_FIELDS` lines 26-30; `src/app/api/employees/route.ts`). The only UI client, `hire-form.tsx`, POSTs to it. ARCHITECTURE.md § People roster paging says these fields are served only on export, which is audited. The GET contradicts that. This is the most important finding in this file.
- ARCHITECTURE.md § Organizational chart is stale. It describes `OrgChartService.getSnapshot`, a `reportsToEmployeeId` tree, and a vacancy list from `EmployeeAssignment.reportsToEmployeeId`. In code: `getSnapshot` does not exist (grep of `src`), `reportsToEmployeeId` is not on the model, and the chart is a saved drawing (ADR-046, which supersedes ADR-009). The vacancy list lives on the positions page, not in the chart.
- `EmployeeRosterService.exportRows` loads the full roster through `listWithCurrentStatus` and filters in memory. Acceptable for an export, but it is an unbounded read on each request.
- `listWithCurrentStatus` is an application-level join: one employee read plus three parallel reads per call. The ARCHITECTURE roster section says the People page moved to database joins, which is true for `EmployeeRosterService.page`. `loadHeadcount` and `OrgChartService.get` still use the in-memory version.
- The legacy `reportsToEmployeeId` read in `OrgChartService.get` (lines 77-91) is a raw collection read that bypasses the Mongoose model. It is needed for the first visit only. Remove it once no org has an unsaved chart.
- `ENGINEERING.md` § 12 still says `reportsToEmployeeId` is acceptable. § 18 forbids it (see Part 1).
