# Complaints Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Complaints module (drag-and-drop board and list of incident reports against an employee, with HR-editable stages) below Performance in the More menu.

**Architecture:** A new `complaints` domain that mirrors Recruitment: a `Complaint` model, a `ComplaintStage` simple catalog (the board columns), a service plus three API routes, and a `/complaints` page copied in structure from `src/app/(app)/recruitment/tracking/`. Nothing existing changes except one-line registrations (catalog registry, visibility, deletion, nav, seed).

**Tech Stack:** Next.js App Router, TypeScript, Mongoose/MongoDB, Zod, Vitest (`mongodb-memory-server`), shadcn/ui, `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-11-14-complaints-module-design.md`. Read it and `knowledge/CHANGE_PROTOCOL.md` first. Reference implementation: `knowledge/domains/recruitment.md` and the files it names.

## Global Constraints

- Branch: stay on `enhancements/session-roster-attendance-payroll`. Do not create a branch or worktree.
- The working tree already has the user's uncommitted edits (including `scripts/seed.ts`, `src/app/(app)/settings/catalogs/page.tsx`, `src/components/shared/nav-links.tsx`, `src/domains/catalog/catalog-registry.ts`, `src/server/db/models/index.ts`). Edit those files in place with anchored edits. Never revert, stash or reformat them. **Do not commit** (the user has not asked); leave all changes uncommitted.
- Complaint fields are exactly: `irNumber` (automatic, `IR-` plus four digits), `employeeId` (respondent), `receivedDate`, `remarks` (optional), `stage`. No other fields.
- The four default stages, exact names and codes: `received` "Received IR/complaint" (sort 0), `nte_scheduled` "Set a date for NTE" (1), `administrative_hearing` "Administrative Hearing" (2), `sanction` "Sanction" (3, `metadata: { isTerminal: true }`).
- Moves are free-form in any direction. No required dates. No DELETE route; HR retires a complaint by moving it to a final stage.
- Catalog slug and permission prefix: `complaint-stages`. Resource permissions: `complaints.create`, `complaints.read`, `complaints.update`.
- Every read and write filters by `organizationId`. Respondent must be an employee of the same organization.
- Audit actions: `complaint.created`, `complaint.updated`, `complaint.stage_moved` (`resourceType: "Complaint"`).
- No hard-coded stage codes in logic; a new complaint starts in the lowest-sort active stage read from the catalog.
- Menu item "Complaints" in the More section directly after Performance, gated by `complaints.read`.

## Review Focus

1. Hidden test complaints (Super Administrator hide) must still count toward IR numbering, or a new number collides with the unique index. Tested in Task 2.
2. Two complaints created at the same moment must get different IR numbers (retry once on duplicate key). Tested in Task 2.
3. A respondent id from another organization, a nonexistent id, or a malformed id is rejected with a clean error, not a crash. Tested in Tasks 2 and 3.
4. An organization with no active complaint stage cannot create a complaint, and gets a clear error. A deactivated lowest stage is skipped. Tested in Task 2.
5. A complaint whose stage was later deactivated or removed still appears on the board, in its own column. A complaint whose respondent record is gone shows a "—" name, not a crash. Tested in Task 4.

---

### Task 1: Complaint stage catalog

**Files:**
- Create: `src/server/db/models/complaint-stage.ts`, `src/domains/catalog/complaint-stage-service.ts`, `src/domains/complaints/default-stages.ts`
- Modify: `src/server/db/models/index.ts`, `src/domains/catalog/catalog-registry.ts`, `src/app/(app)/settings/catalogs/page.tsx`, `src/components/shared/nav-links.tsx` (`CATALOG_READ_PERMISSIONS`), `scripts/seed.ts`
- Test: `tests/domains/complaints/complaint-stages.test.ts`

**Interfaces:**
- Produces: `ComplaintStageModel` (exported from `@/server/db/models`); `ComplaintStageService` (same shape as `RecruitmentStageService`: `create`, `updateStatus`, `update`, `listCurrent`, `getByCode`, `assertValidCode`); `DEFAULT_COMPLAINT_STAGES: { code: string; name: string; description?: string; sortOrder: number; metadata?: Record<string, unknown> }[]`; catalog slug `"complaint-stages"` in `CATALOG_REGISTRY`.

- [ ] **Step 1: Baseline.** Run `npm run typecheck`, `npm run lint`, `npm test`. Note any failures already present (the tree has user edits) so they are not blamed on this work.
- [ ] **Step 2: Write the failing test** in `tests/domains/complaints/complaint-stages.test.ts`, modelled on `tests/domains/catalog/education-level-catalog.test.ts`:
  - `isCatalogTypeSlug("complaint-stages")` is true; `CATALOG_REGISTRY["complaint-stages"].permissionPrefix` is `"complaint-stages"` and `.service` is `ComplaintStageService`.
  - `DEFAULT_COMPLAINT_STAGES.map(s => s.name)` equals `["Received IR/complaint", "Set a date for NTE", "Administrative Hearing", "Sanction"]`; codes equal `["received", "nte_scheduled", "administrative_hearing", "sanction"]`; only `sanction` has `metadata.isTerminal === true`.
  - `ComplaintStageService.create` then `assertValidCode` accepts a created code and rejects an unknown one once a stage exists.
- [ ] **Step 3: Run it to confirm it fails** (`npx vitest run tests/domains/complaints/complaint-stages.test.ts`): modules missing.
- [ ] **Step 4: Implement.**
  - `complaint-stage.ts`: copy `recruitment-stage.ts`, renamed `ComplaintStage` / `ComplaintStageModel`.
  - `complaint-stage-service.ts`: `export const ComplaintStageService = createSimpleCatalogService(ComplaintStageModel, "ComplaintStage");`
  - `default-stages.ts`: export `DEFAULT_COMPLAINT_STAGES` with the exact values in Global Constraints and a header comment like `recruitment/default-stages.ts`.
  - Register the model in `models/index.ts`, add `"complaint-stages": { service: ComplaintStageService, permissionPrefix: "complaint-stages" }` to `CATALOG_REGISTRY`, add a Settings section `{ catalogType: "complaint-stages", title: "Complaint stages", description: "The complaint board columns, in order." }`, and add `"complaint-stages.read"` to `CATALOG_READ_PERMISSIONS` in `nav-links.tsx`.
  - `scripts/seed.ts`: add permission keys `complaint-stages.create|read|update` (category `"settings"`, descriptions like the recruitment-stage ones) and `await seedCatalogDefaults(ComplaintStageModel, DEFAULT_COMPLAINT_STAGES);` next to the recruitment call; import the model and defaults.
- [ ] **Step 5: Verify.** `npx vitest run tests/domains/complaints tests/domains/catalog tests/app/nav-permissions.test.tsx tests/security/route-guards.test.ts` all pass (the nav test "keeps the catalog permission list in step with the catalog registry" must pass).

### Task 2: Complaint model, validation, service, pipeline helpers

**Files:**
- Create: `src/server/db/models/complaint.ts`, `src/shared/validation/complaint.ts`, `src/domains/complaints/complaint-service.ts`, `src/domains/complaints/pipeline.ts`
- Modify: `src/server/db/models/index.ts`, `src/domains/visibility/visibility-service.ts` (`HIDEABLE`: add `complaint`), `src/domains/deletion/deletion-registry.ts` (`DELETABLE_TYPES`: add `complaint: { noun: "complaint", plan: leaf(models.ComplaintModel, "Complaint", text("irNumber")) }`)
- Test: `tests/domains/complaints/complaint-service.test.ts`, `tests/domains/complaints/pipeline.test.ts`

**Interfaces:**
- Consumes: `ComplaintStageService` (Task 1); `EmployeeModel`; `AuditService.record`; `NotFoundError`, `ValidationError`/`BusinessRuleError` from `@/shared/errors`.
- Produces:
  - `ComplaintModel` with `organizationId`, `employeeId` (ref Employee), `irNumber` (string), `receivedDate` (Date), `remarks` (string, optional), `stage` (string, required, no default). Indexes: unique `(organizationId, irNumber)`, `(organizationId, stage)`, `(organizationId, employeeId)`. Uses `hiddenPlugin`. Timestamps on.
  - `complaintSchema` (zod): `organizationId: objectId()`, `employeeId: objectId()`, `receivedDate: z.coerce.date()`, `remarks: z.string().trim().max(1000).optional()`; `createComplaintSchema`, `updateComplaintSchema` (both the same), `moveComplaintStageSchema` (`organizationId`, `stage` trimmed 1–200); types `CreateComplaintInput`, `UpdateComplaintInput`, `MoveComplaintStageInput`.
  - `ComplaintService.create(input: CreateComplaintInput, actor: { userId?: string })`, `.update(id: string, organizationId: string, patch: Omit<UpdateComplaintInput, "organizationId">, actor)`, `.moveStage(id, organizationId, patch: { stage: string }, actor)`, `.listForOrganization(organizationId: string, filters?: { stage?: string })` (sorted `receivedDate` descending, `.lean()`).
  - `pipeline.ts`: `filterComplaints<T extends { irNumber: string; respondentName: string }>(complaints: T[], filters: { query?: string }): T[]` (every typed word must appear in the IR number or respondent name, case-insensitive; blank query returns all) and `isClosedStage(stage: { metadata?: Record<string, unknown> }): boolean` (true only when `metadata.isTerminal === true`).

- [ ] **Step 1: Write failing service tests** in `complaint-service.test.ts`, with the same setup style as `tests/domains/recruitment/applicant-service.test.ts` (an `OrganizationModel` per test, an `EmployeeModel` seeded the way the repo's other domain tests do; copy a helper from an existing test such as `tests/domains/attendance/attendance-service.test.ts` or `tests/domains/workforce`). Seed the four default stages via `ComplaintStageService.create`. Assertions:
  - `create` returns `irNumber` `"IR-0001"`, `stage` `"received"`; a second returns `"IR-0002"`.
  - `create` with the lowest-sort stage deactivated (`updateStatus`) starts in the next one; with no active stage it throws.
  - `create` with an employee from another organization, an unknown id and a non-employee id throws.
  - Two `create` calls through `Promise.all` end with two different IR numbers.
  - A complaint hidden with `{ hiddenFromOthers: true }` still counts: after hiding IR-0002, the next create is `IR-0003`.
  - `moveStage` moves to any configured stage in any direction and rejects an unknown stage.
  - `update` changes respondent, date and remarks; the audit log has `complaint.updated` with before and after of those three fields; `create` and `moveStage` write their audit entries.
  - Every method with a different `organizationId` throws NotFound.
  - `listForOrganization` returns newest `receivedDate` first and honors `{ stage }`.
- [ ] **Step 2: Write failing pipeline tests** in `pipeline.test.ts` for `filterComplaints` (blank returns all; "cruz juan" matches "Juan Dela Cruz"; matches an IR number) and `isClosedStage`.
- [ ] **Step 3: Run both; confirm they fail.**
- [ ] **Step 4: Implement** the model, schema, service and helpers. Notes the signatures do not fix:
  - IR number: read every complaint number for the organization with `{ includeHidden: true }`, take the numeric maximum of the digits after `IR-`, add one, pad to four digits (more digits are fine past 9999). On a duplicate-key error (code 11000) recompute and retry once, then throw.
  - Starting stage: first active stage by `sortOrder` from `ComplaintStageService.listCurrent`; throw a clear `BusinessRuleError` ("No active complaint stage. Add one under Settings > Catalogs.") when none.
  - Respondent check: `EmployeeModel.exists({ _id, organizationId })`, else `NotFoundError("Employee not found in this organization")`.
  - `moveStage` validates through `ComplaintStageService.assertValidCode`.
  - Register `ComplaintModel` in `models/index.ts`, `HIDEABLE` and `DELETABLE_TYPES`.
- [ ] **Step 5: Add** to the existing visibility and deletion test files one assertion each: `VisibilityService.isHideable("complaint")` is true and `isDeletableType("complaint")` is true.
- [ ] **Step 6: Verify.** `npx vitest run tests/domains/complaints tests/domains/visibility tests/domains/deletion` pass, then `npm run typecheck`.

### Task 3: API routes and permissions

**Files:**
- Create: `src/app/api/complaints/route.ts`, `src/app/api/complaints/[id]/route.ts`, `src/app/api/complaints/[id]/stage/route.ts`
- Modify: `scripts/seed.ts`
- Test: `tests/app/api/complaint-routes.test.ts`

**Interfaces:**
- Consumes: `ComplaintService`, the schemas from Task 2, `requirePermission`, `toErrorResponse`, `organizationIdParamSchema`.
- Produces: `GET /api/complaints?organizationId=&stage=` (`complaints.read`) returns `{ complaints }`; `POST /api/complaints` (`complaints.create`) returns `{ complaint }` with 201; `PATCH /api/complaints/[id]` (`complaints.update`) returns `{ complaint }`; `PATCH /api/complaints/[id]/stage` (`complaints.update`) returns `{ complaint }`.

- [ ] **Step 1: Write failing route tests** modelled on `tests/app/api/employment-and-evaluation-routes.test.ts` (copy its mocking approach): each handler calls `requirePermission` with the right key and organization; a denied permission returns 403 and the service is not called; a malformed `employeeId` returns 400; a valid POST returns 201.
- [ ] **Step 2: Run; confirm failure.**
- [ ] **Step 3: Implement** the three route files as line-for-line analogues of `src/app/api/applicants/route.ts`, `[id]/route.ts` and `[id]/stage/route.ts`. In `scripts/seed.ts` add `complaints.create` ("Add complaints"), `complaints.read` ("View complaints"), `complaints.update` ("Edit complaints and move them between stages"), category `"complaints"`. Do not add `complaints.delete`.
- [ ] **Step 4: Verify.** `npx vitest run tests/app/api tests/security/route-guards.test.ts` pass (the route-guards test checks every permission key exists in the seed and that writes do not use read permissions).

### Task 4: Page, board, list, sheet, dialog, navigation

**Files:**
- Create under `src/app/(app)/complaints/`: `page.tsx`, `loading.tsx`, `complaint-pipeline.tsx`, `kanban-board.tsx`, `stage-column.tsx`, `complaint-card.tsx`, `complaint-list.tsx`, `complaint-sheet.tsx`, `complaint-form-dialog.tsx`
- Modify: `src/components/shared/nav-links.tsx`, `tests/standards/mutation-feedback.test.ts`
- Test: `tests/app/complaint-pipeline.test.tsx`; add one case to `tests/app/nav-permissions.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3; `EmployeeService.listWithCurrentStatus`, `formatPersonName`; `SearchableOptionSelect`; `DeleteRecordButton`; `isSuperAdmin`; `KanbanSkeleton`.
- Produces: `ComplaintCardData = { _id: string; irNumber: string; employeeId: string; respondentName: string; stage: string; receivedDate: string; remarks?: string | null }`, `StageInfo = { code: string; name: string; isTerminal?: boolean; description?: string }`, `ComplaintFormValue = { id: string; employeeId: string; receivedDate: string; remarks?: string | null }`, and the nav entry `{ href: "/complaints", label: "Complaints", icon: <lucide icon, e.g. ShieldAlert>, permission: "complaints.read" }`.

- [ ] **Step 1: Write failing tests.**
  - `tests/app/complaint-pipeline.test.tsx`, mirroring `tests/app/applicant-pipeline.test.tsx`: the board renders one column per stage with its cards; a "Move to" action calls `PATCH /api/complaints/<id>/stage` with `{ organizationId, stage }` and shows the moved toast; a failed response rolls the card back and shows an error toast; a complaint whose stage is not in `stages` still appears in its own column (Review Focus 5); a card with `respondentName` `"—"` renders; searching by IR number narrows the cards.
  - `nav-permissions.test.tsx`: a viewer holding only `complaints.read` sees the Complaints item, one without it does not, and the item comes right after Performance.
- [ ] **Step 2: Run; confirm failure.**
- [ ] **Step 3: Implement.** Copy each file in `src/app/(app)/recruitment/tracking/` to the matching new name and adapt:
  - Drop the position filter, email, phone and position text. Card shows IR number, respondent name, received date and remarks; the list view shows the same columns; the sheet shows them plus Edit and, for the Super Administrator only, `DeleteRecordButton` with `type="complaint"` (as the applicant sheet does, if it does).
  - Form dialog fields: respondent via `SearchableOptionSelect` (required), Received date (required), Remarks. POST/PATCH to `/api/complaints` and `/api/complaints/<id>`. Keep the same toasts, spinner and `data-testid` style (`complaints-create-button`, and so on).
  - `page.tsx`: gate on `complaints.read` with `NoAccessState`; `canCreate`/`canUpdate` from `hasPermission`; load stages, complaints and `EmployeeService.listWithCurrentStatus` in parallel; build `respondentName` from the roster map with `"—"` fallback; add orphaned-stage columns exactly as recruitment's page does; show the empty state "No complaint stages yet" with a pointer to Settings > Catalogs when there are none. Title "Complaints", description "Every incident report and complaint from receipt to sanction. Drag a card between stages, or open it for details."
  - `isTerminal` stages render with the closed look the recruitment board uses for terminal stages. No metric strip.
  - `loading.tsx` uses `KanbanSkeleton` like the recruitment one.
  - Add the nav item after Performance. Add `"src/app/(app)/complaints/complaint-pipeline.tsx": "optimistic drag-and-drop: the card moves at once and rolls back with a toast on failure"` to `NO_SPINNER` in the mutation-feedback test; all other new client files must satisfy the spinner and toast rules unaided.
- [ ] **Step 4: Verify.** `npx vitest run tests/app tests/standards` pass, then `npm run typecheck && npm run lint`.

### Task 5: Docs and full verification

**Files:**
- Create: `knowledge/domains/complaints.md`, `docs/architecture/adr/ADR-054-complaints-module.md` (use the next free number if 054 is taken)
- Modify: `ARCHITECTURE.md`, `knowledge/domains/catalog.md` (fourteen to fifteen catalogs), `knowledge/README.md` if it lists domain files

- [ ] **Step 1: Write the knowledge file** in the format of `knowledge/domains/recruitment.md` (purpose, governing docs, services, models, routes, pages, tests, rules, gaps, last verified), the ADR (context, decision, consequences: separate from Cases, free-form moves, org-wide visibility, IR numbering) and an ARCHITECTURE.md section for Complaints. Update the catalog count in `catalog.md`.
- [ ] **Step 2: Full verification.** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Compare failures to the Task 1 baseline; any new failure must be fixed.
- [ ] **Step 3: Run the app** (use the `run` skill, `npm run dev`, port 4100) after `npm run db:seed`. As HR, open More > Complaints, add a complaint, drag it through all four stages, edit it, open its sheet, and reload. Check Settings > Catalogs shows "Complaint stages". Confirm a user without `complaints.read` has no menu item and gets `NoAccessState` at `/complaints`.
- [ ] **Step 4: Leave everything uncommitted** and report what changed, the baseline versus final test results, and the calls made along the way.
