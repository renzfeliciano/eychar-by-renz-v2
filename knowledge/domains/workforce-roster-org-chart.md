# Workforce: roster, export, headcount and org chart

Part 2 of the Workforce domain. The employee lifecycle (hire, employment, assignments, transfers) is in `workforce.md`.

**Purpose:** the read side of the workforce: the paged, searched and sorted roster for `/people` and its summary strip, the audited roster export, headcount for the organization screens, and the org chart HR draws on a canvas (ADR-046).
**Governing docs:** ADR-046 (org chart is a drawn canvas, supersedes ADR-009), ADR-009 (superseded; its projection design still described in ARCHITECTURE.md), ADR-019 (roster fields), ADR-044 (paging and counting in the database), ARCHITECTURE.md § People roster paging, § Organizational chart (Phase 4, ADR-009; **stale**, see gaps), ENGINEERING.md § 18 (org chart is the source of truth for reporting lines), § 36 (API architecture), § 58 (domain test).
**Services:**
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

**Models:**
- `src/server/db/models/org-chart.ts` (`OrgChartModel`): `nodes[]` (`key`, `type` person or group, `employeeId`, `label`, `color`, `x`, `y`), `edges[]` (`from` = parent, `to` = child), `updatedBy`. Unique index on `organizationId`.
- Read: `EmployeeModel`, `EmploymentModel`, `EmployeeAssignmentModel`, `PersonModel` (`src/server/db/models/*.ts`). Position and project names come from `PositionService.listCurrent`, `ProjectService.listCurrent`, and `EmploymentStatusService.listCurrent`.

**Routes:**
- `src/app/api/employees/route.ts` GET: full roster, unpaged (`employees.read`). See gaps.
- `src/app/api/employees/export/route.ts` GET: `employees.read`, `enforceRateLimit("export", userId)`, `auditExport` action `employees.exported` (lines 21, 38).
- `src/app/api/organization-chart/route.ts`: GET (`employees.read`, `OrgChartService.get`), PUT (`org-chart.update`, `OrgChartService.save`).

**Pages:**
- `src/app/(app)/people/page.tsx`: calls `EmployeeRosterService.page` (lines 81, 90) and `summary` (line 88). Components: `people-filters.tsx`, `people-export-actions.tsx` (GET `/api/employees/export`), `people-print-report.tsx`.
- `src/app/(app)/organization/chart/page.tsx` and `org-chart-canvas.tsx`: saves with PUT `/api/organization-chart` (line 275). Uses `canLink` before drawing a link (line 198).
- `src/app/(app)/organization/positions/page.tsx` also lists vacant positions, which the ARCHITECTURE org-chart section describes as a projection feature.

**Tests:**
- `tests/domains/workforce/employee-roster-service.test.ts`
- `tests/domains/workforce/org-chart-service.test.ts`, `org-chart-tree.test.ts`
- `tests/domains/workforce/headcount.test.ts`
- `tests/domains/deletion/deletion-service.test.ts` (org chart is in the deletion registry, `src/domains/deletion/deletion-registry.ts`)
- No test for `GET /api/employees/export` or `/api/employees` route handlers was found by grep (`tests/app/api/route-handlers.test.ts` may cover them; not checked).

**Rules a change must respect:**
- The roster page is paged, searched and sorted in the database. Do not load the whole organization for a page view (ARCHITECTURE.md § People roster paging; comment `employee-roster-service.ts` lines 303-306).
- The page query projects only what the table shows: names, email, birth date and remarks (`employee-roster-service.ts` lines 342-352). Contact details and statutory IDs leave the database only through the export, which is permission-checked, rate-limited and audited (lines 411-416; `export/route.ts`). Keep that split.
- The summary returns counts only, with no names or IDs (lines 364-368).
- The org chart is a forest: one parent per card, no loops, every card an employee of this org or a group (`chartProblems`, `save`). `canLink` blocks cycles in the browser. Validate on both sides (ENGINEERING.md § 18).
- Card details (name, position, project) come from live records, never stored on the chart (`OrgChartService.get`, `people` mapping).
- Do not add a `reportsToEmployeeId` write path (ENGINEERING.md § 18; ADR-046). The legacy read in `get` exists only for first-visit layouts.
- Headcount counts current staff only, using the status catalog flag (`loadHeadcount`, `isCurrentStaff`). Use the same helper for any new count.
- `arrange` keeps card keys and only changes x and y (`org-chart-tree.ts` `arrange`).

**Known gaps / mismatches:**
- **`GET /api/employees` returns the entire roster with no paging and no audit entry**, including `sssNumber`, `philHealthNumber`, `pagIbigNumber`, `tinNumber`, `birthDate`, `remarks` and contact details (`employee-service.ts` `loadWithCurrentStatus`, `ROSTER_PERSON_FIELDS` lines 26-30; `src/app/api/employees/route.ts`). The only UI client, `hire-form.tsx`, POSTs to it. ARCHITECTURE.md § People roster paging says these fields are served only on export, which is audited. The GET contradicts that. This is the most important finding in this file.
- ARCHITECTURE.md § Organizational chart is stale. It describes `OrgChartService.getSnapshot`, a `reportsToEmployeeId` tree, and a vacancy list from `EmployeeAssignment.reportsToEmployeeId`. In code: `getSnapshot` does not exist (grep of `src`), `reportsToEmployeeId` is not on the model, and the chart is a saved drawing (ADR-046, which supersedes ADR-009). The vacancy list lives on the positions page, not in the chart.
- `EmployeeRosterService.exportRows` loads the full roster through `listWithCurrentStatus` and filters in memory. Acceptable for an export, but it is an unbounded read on each request.
- `listWithCurrentStatus` is an application-level join: one employee read plus three parallel reads per call. The ARCHITECTURE roster section says the People page moved to database joins, which is true for `EmployeeRosterService.page`. `loadHeadcount` and `OrgChartService.get` still use the in-memory version.
- The legacy `reportsToEmployeeId` read in `OrgChartService.get` (lines 77-91) is a raw collection read that bypasses the Mongoose model. It is needed for the first visit only. Remove it once no org has an unsaved chart.
- `ENGINEERING.md` § 12 still says `reportsToEmployeeId` is acceptable. § 18 forbids it (see `workforce.md`).

**Last verified:** 6587050.
