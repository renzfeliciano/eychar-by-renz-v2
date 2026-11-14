# Organization structure (units, positions, locations, projects)

**Purpose:** The organization's reference structure: the unit hierarchy, positions, locations (sites with geofence coordinates), projects (the scope most HR permissions narrow to), and the organization record itself, including which organizations an account can see.
**Governing docs:** ARCHITECTURE.md § Organization structure (Phase 2): ADR-004 (position vs role) and ADR-006 (effective dating). ADR-026 (geofenced clock-in; ARCHITECTURE.md § Employee self-service attendance, lines ~141-144, checks `geofenceRadiusMeters` from the site). ADR-043 (project-scoped grants, ARCHITECTURE.md § Known gaps). ENGINEERING.md §10 (organization units), §11 (positions), §16 (historical organization), §17 (projects and sites), §27 (effective dating). ENGINEERING.md §57 (Phase 2 order).
**Services** (all in `src/domains/organization/`):
- `organization-service.ts`: `OrganizationService` with `create({name, slug}, actor)` and `listAccessibleTo(userId)`. The latter returns organizations where the user has a role assignment in effect now. The dashboard, layout and attendance export use it.
- `organization-unit-service.ts`: `OrganizationUnitService` with `create` (optional `parentUnitId`), `updateStatus`, `listCurrent` (effective-dated).
- `position-service.ts`: `PositionService` with `create` (code defaults to `slugifyUpperKebab(title)`), `updateStatus`, `listCurrent` (effective-dated).
- `location-service.ts`: `LocationService` with `create`, `listCurrent`, `update` (`$set`/`$unset` split, `""` clears a field), `updateStatus`. Coordinates must be given as a pair (`assertCoordinatePair`).
- `project-service.ts`: `ProjectService` with `create` (optional `locationId`), `listCurrent(org, only)` where `only` narrows to a project-scoped viewer's projects, `update` (name, description, location), `updateStatus`.

**Models** (`src/server/db/models/`):
- `organization.ts` (`Organization`): `slug` (unique), `status`, `security {idleTimeoutSeconds, idleWarningSeconds, requireTwoStepForStaff}`, `compliance {finalPayDays}` (default 30).
- `organization-unit.ts`: `code` (unique per org), `type` (free-form), `parentUnitId`, `effectiveFrom`, `effectiveTo`, `status`. Index `{parentUnitId}`.
- `position.ts`: `title`, `code` (unique per org), `effectiveFrom`, `effectiveTo`, `status`.
- `location.ts`: `name`, `code` (unique per org), `address`, `latitude`, `longitude`, `geofenceRadiusMeters` (10 to 5000, default 100), `status`. No effective dating (the model says so in a comment at line 4).
- `project.ts`: `name`, `code` (unique per org), `locationId`, `description`, `status`, `metadata`. Index `{locationId}`. No effective dating.
- `role-assignment.ts`: read by `listAccessibleTo`.

**Routes** (`src/app/api/`):
- `organizations/route.ts`: `GET`, `requireAuthenticatedUser`, then `listAccessibleTo`. No organization id is taken from the client.
- `organization-units/route.ts`: `GET` `organization-units.read`, `POST` `organization-units.create`. `organization-units/[id]/route.ts`: `PATCH` (status) `organization-units.update`.
- `positions/route.ts`: `GET` `positions.read`, `POST` `positions.create`. `positions/[id]/route.ts`: `PATCH` `positions.update`.
- `locations/route.ts`: `GET` `locations.read`, `POST` `locations.create`. `locations/[id]/route.ts`: `PATCH` `locations.update`.
- `projects/route.ts`: `GET` through `requireAccessibleProjects`, `POST` `projects.create`. `projects/[id]/route.ts`: `PATCH` with `projects.update` for status, or `requireProjectAccess` for name, description and location.
- `organization-chart/route.ts` and `organization-chart` use `OrgChartService`, which is outside this domain's files.

**Pages** (`src/app/(app)/organization/`):
- `units/page.tsx`, `create-unit-dialog.tsx`, `loading.tsx`.
- `positions/page.tsx`, `create-position-dialog.tsx`, `loading.tsx`.
- `locations/page.tsx`, `create-location-dialog.tsx`, `edit-location-dialog.tsx`, `site-coordinates-fields.tsx`, `loading.tsx`.
- `projects/page.tsx`, `create-project-dialog.tsx`, `edit-project-dialog.tsx`, `loading.tsx`.
- `chart/page.tsx` and `org-chart-canvas.tsx` (the chart reads the same structure; `OrgChartService` is not in this domain).

**Tests:**
- `tests/domains/organization/location-service.test.ts` (13), `organization-unit-service.test.ts` (7), `position-service.test.ts` (2), `project-service.test.ts` (9).
- No test targets `OrganizationService`. `tests/domains/organization/` has no file for it.

**Rules a change must respect:**
- Every lookup and write is scoped by `organizationId` in the query (for example `findOne({_id, organizationId})` in each `updateStatus`). Referenced ids (parent unit, location) are checked with `exists` in the same organization before the write.
- Codes are unique per organization by index (`organization-unit.ts`, `position.ts`, `location.ts`, `project.ts`). Duplicate-key errors are mapped to `ConflictError` on create and on location update.
- A location's latitude and longitude must be set together, and the check runs on the resulting values after the patch (`location-service.ts`, `update`). A half-set pair would make the geofence silently compare against 0.
- Clearing a field in a PATCH sends `""`, which becomes `$unset`. Assigning `undefined` on a document does not persist (comment in `location-service.ts`, `update`).
- `listCurrent` on units and positions filters `effectiveFrom`/`effectiveTo` to now. Locations and projects do not, and their models have no effective dates.
- A project-scoped viewer sees only their projects in `ProjectService.listCurrent(org, only)`, and the project routes use `requireProjectAccess` for non-status edits.
- `listAccessibleTo` uses only role assignments in effect now (`effectiveFrom`, `effectiveTo`). Never trust a client-supplied organization list (comment in `organization-service.ts`).
- Changes are written with `updateStatus` (active or inactive, and `effectiveTo` for the effective-dated models). No service here hard-deletes. Removal goes through the recycle bin (see the deletion file).

**Known gaps / mismatches:**
- ARCHITECTURE.md § Organization structure says every service "never a delete". The recycle-bin registry deletes positions, projects, locations and units into the bin (`src/domains/deletion/deletion-registry.ts`). Not a hard delete, but the wording is out of date.
- Project names are not unique, but `ProjectService.create` maps any duplicate-key error to "A project named X already exists". The unique index is on `code` (`project.ts`), so a duplicate code produces the name message. `ProjectService.update` does not map duplicate keys to `ConflictError` at all.
- `PositionService.create` maps duplicates to "A position named X already exists". The unique index is on `code`, which defaults to the title's slug. Two titles that slug alike collide with a misleading message.
- ENGINEERING.md §53 is cited for "no hard delete" in ARCHITECTURE.md and in code comments (`position-service.ts`, `organization-unit-service.ts`). §53 is Database Safety and does not state that rule. The rule's real home is ENGINEERING.md §33 or ADR-033. Low severity.
- `OrganizationService.create` checks the slug in code before the insert. The schema has `unique: true` on `slug` (`organization.ts`), so the check is a friendly message, not a guarantee. No caller of `OrganizationService.create` exists in `src`, `scripts` or `tests`. `listAccessibleTo` is called from `src/app/(app)/layout.tsx`, `src/app/_shared/get-current-organization.ts`, `src/app/api/organizations/route.ts`, and the attendance and payroll export routes.
- `compliance.finalPayDays` (`organization.ts`) and `PayrollPolicy.finalPayDeadlineDays` (used by final settlement) are two separate final-pay deadline sources. See the final-settlement file.

**Last verified:** 6587050
