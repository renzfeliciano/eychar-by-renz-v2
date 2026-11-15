# Complaints module: design and implementation plans

Built 2026-11-14. Merged on 2026-11-15 from `docs/superpowers/specs/2026-11-14-complaints-module-design.md` and the two plans `2026-11-14-complaints-module.md` and `2026-11-14-complaint-stage-details.md`. Domain facts: `../domains/complaints.md`; decision: ADR-054.

## Part 1 (design): Complaints module (design)

Status: approved. Branch: `enhancements/session-roster-attendance-payroll` (the user's current branch; no new branch).
The working tree already holds the user's uncommitted work, so this change edits files in place and is not committed
unless the user asks.

### Intent and why

HR needs a place to track incident reports (IR) and complaints about an employee as they move through
a disciplinary process. The user wants it to work like the Recruitment module: a board HR drags
cards across, where the columns are data HR can edit. The four starting stages are the steps HR
already follows: **Received IR/complaint**, **Set a date for NTE**, **Administrative Hearing**,
**Sanction**.

The user has not said why beyond "like Recruitment"; the intent above is taken from their request.

### Goals

- A **Complaints** page with a drag-and-drop board and a list view, the same interaction as
  `/recruitment/tracking`.
- A **Complaint stage** catalog (name, description, order, active/inactive), edited in
  Settings > Catalogs, seeded with the four stages above.
- A complaint record with these fields (amended 2026-11-14, see "Stage details" below):
  - IR number (automatic, for example `IR-0007`)
  - Respondent (picked from existing employees)
  - Date received
  - Stage (from the catalog)
  - Incident details, all optional except the two above: project/site, brief description, what, where, when
    (date of the incident), complainant name, remarks
  - Stage details, one section per stage, filled in as the complaint moves (NTE, hearing, sanction)
- Menu item **Complaints** in the More section, directly below Performance.
- Every change audited. Complaints are never deleted by HR; a card is retired by moving it to a final stage.

### Non-goals and anti-goals

- No attachments or evidence upload. (The first version had no NTE, hearing or sanction fields; the
  user's mockups on 2026-11-14 reversed that, see "Stage details".)
- The mockup's **Actions** menu (Issue NTE, Upload Evidence, Schedule Hearing, Record Minutes, Generate
  Decision, Generate Sanction Notice, Close Case) and its **status legend** (Completed, Ongoing, Pending,
  Overdue) are a later phase, by the user's decision. Do not build them now.
- No rule that blocks a move (for example "needs an NTE date first"). Moves are free-form in any
  direction, as in Recruitment. The stage form offered on a move can be skipped.
- Not part of the Cases module. Cases is a project-level legal register and stays unchanged
  (ENGINEERING §52).
- Not shown to employees in any self-service area. A complaint about a person must never leak.
- No notifications, email, document generation or escalation workflow.

### Constraints

- Follow `docs/engineering/ENGINEERING.md` and `knowledge/CHANGE_PROTOCOL.md`: logic in a domain service, route handlers
  only orchestrate, authorization on the server, catalogs hold meaning (§2, §37, §55).
- Everything is scoped by `organizationId`. Respondent must be an employee of the same organization.
- Existing behavior and data do not change. All new collections, so no migration. Seed stays idempotent (§53).
- Stage codes are never hard-coded as an enum. What a stage means comes from catalog metadata (ADR-045).

### Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | New `complaints` domain that mirrors Recruitment | Most new files; nothing existing changes; matches repo patterns |
| B | Reuse the Applicant model with a type flag | Mixes confidential disciplinary data with recruitment reads; Applicant requires a position and carries contact fields |
| C | Extend Cases with an employee and a board | Changes a working module with a different purpose (project legal register) |

The user was told A is the recommendation and was asked for changes; none were given.

### Design (approach A)

**Data**
- `Complaint` model (`src/server/db/models/complaint.ts`): `organizationId`, `employeeId` (respondent, ref
  Employee), `irNumber`, `receivedDate`, `remarks`, `stage` (plain string validated against the catalog).
  Indexes: unique `(organizationId, irNumber)`, `(organizationId, stage)`, `(organizationId, employeeId)`.
  Applies the hidden plugin like Applicant (Super Administrator test-data hiding).
- `ComplaintStage` catalog model built with `buildSimpleCatalogSchema`; a one-line service from
  `createSimpleCatalogService`; a `CATALOG_REGISTRY` entry with permission prefix `complaint-stages`.
- Default stages in `src/domains/complaints/default-stages.ts`: `received` (sort 0), `nte_scheduled` (1),
  `administrative_hearing` (2), `sanction` (3). The seed adds them idempotently through `seedCatalogDefaults`.
  The final stage carries `metadata.isTerminal: true` so the board can show it as closed.

**Domain** (`src/domains/complaints/`)
- `complaint-service.ts`: `create`, `update` (respondent, date received, remarks), `moveStage`,
  `listForOrganization(orgId, { stage })`. Private checks that the respondent is an employee of the org and
  that the stage exists in the catalog.
- IR number: next number for the organization, formatted `IR-` plus four digits, computed in the service;
  the unique index guards a race, and the service retries once on a duplicate. Gaps are acceptable.
- Pure helpers in `pipeline.ts` for filtering and tone, as Recruitment's `pipeline.ts` does.
- New complaints start in the lowest-sort active stage (read from the catalog, not hard-coded, avoiding the
  Recruitment gap that `create` assumes `applied`).
- Audit actions: `complaint.created`, `complaint.updated`, `complaint.stage_moved`. Updates record
  before and after for respondent, date and remarks (fixing the Recruitment audit gap).

**API** (`src/app/api/complaints/...`)
- `GET` `/api/complaints` (`complaints.read`, optional `stage`), `POST` (`complaints.create`).
- `PATCH` `/api/complaints/[id]` (`complaints.update`), `PATCH` `/api/complaints/[id]/stage` (`complaints.update`).
- No `DELETE`. Zod schemas in `src/shared/validation/complaint.ts`.

**UI** (`src/app/(app)/complaints/`)
- Page, board, stage column, card, list, detail sheet and create/edit dialog, copied in structure from
  `recruitment/tracking`. The respondent is chosen with an employee picker. Loading skeleton reuses `KanbanSkeleton`.
- `nav-links.tsx`: item `{ href: "/complaints", label: "Complaints", permission: "complaints.read" }` right after Performance.

**Permissions and seed**
- New keys: `complaints.create`, `complaints.read`, `complaints.update`, `complaint-stages.create`,
  `complaint-stages.read`, `complaint-stages.update`. The existing seed grants all baseline permissions
  except `.delete` to the HR administrator role with `$addToSet`, so re-running `npm run db:seed` gives
  them to HR. Other roles get nothing unless HR assigns it.
- Register `complaint` in `VisibilityService` (hideable) and `DELETABLE_TYPES` (Super Administrator
  recycle bin, a leaf), the same as `applicant`.

**Tests** (added to the existing suites, none removed)
- `tests/domains/complaints/complaint-service.test.ts`: create, update, move, invalid stage, respondent from another org, IR numbering, audit.
- `tests/domains/complaints/pipeline.test.ts`: pure helpers.
- Authorization: a user without `complaints.read` gets nothing; cross-organization read and write fail.
- `tests/app/complaint-pipeline.test.tsx`: board renders stages and moves a card, mirroring `applicant-pipeline.test.tsx`.
- Update catalog tests that count catalog types, and the seed test if present.

**Docs**
- New `knowledge/domains/complaints.md`, an ARCHITECTURE.md section and a short ADR (next free number after ADR-053).

### Stage details (amendment, 2026-11-14)

Source: the user's two mockups, `docs/complaint_1.jpg` (Actions menu and status legend, later phase) and
`docs/complaint_2.jpg` (the four-column board, each column showing its own fields). The user confirmed:
each stage's details are real and filled in; the Actions menu is later; approach A below.

**Approaches considered for the stage details.**

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Details stored on the complaint, one section per stage, with the field set of each section fixed in code by stage code | Smallest change, reuses the built board; a stage HR adds later gets only a generic section (date, date sent, remarks) |
| B | Fields defined per stage in the catalog (form builder) | Most flexible; needs a form builder, field types and validation, far beyond the mockup |
| C | A separate record for every stage entry | Full history (two hearings, a re-issued NTE); heavier model and screens; the mockup shows one set per stage |

**Fields (from the mockup).**
- *Incident* (top level on the complaint; the create and edit dialog): `projectId` (Project/Site, a dropdown of the organization's existing Projects, the list the Cases module uses; user decision 2026-11-14, replacing free text; must belong to the organization, a deleted or deactivated one stays selectable on an existing complaint), `description`
  (Brief description), `what`, `where`, `incidentDate` (When), `complainantName` (free text: complainants may be
  tenants or unit owners, not employees), `remarks` (e.g. Employee/Unit owner/Tenant/Affiliate). "Who" and "To" are
  the respondent already on the record; no separate field. `receivedDate` stays and is not the incident date.
- *Stage sections*, keyed by stage code in `stageDetails`:
  - `nte_scheduled`: `date`, `violations` (text, from the company code of conduct), `sentDate` (date sent by
    email), `remarks` (e.g. date received by the employee, date signed).
  - `administrative_hearing`: `date`, `hearingDate` (possible date of hearing), `mode` (`face_to_face` or
    `virtual`), `sentDate`, `remarks`.
  - `sanction`: `date`, `sanction` (text, sanction on the violations), `sentDate`, `remarks`.
  - any other stage code: generic `date`, `sentDate`, `remarks`.
- Violations and sanction are free text for now. If the company code of conduct becomes a catalog, that is a later
  change. All dates are calendar days (UTC midnight, shown in UTC like `receivedDate`).

**Behaviour.**
- Required to add a complaint: respondent and date received (as built). Everything else is optional so intake is never
  blocked.
- Moving a card to a stage whose section is empty opens that stage's form (drag or "Move to"). The form has
  **Save and move** and **Move without details**; closing it cancels the move and the card stays put, so a card is never
  moved optimistically before the form answers. A stage whose section already has data moves straight away.
- Every section is editable at any time from the side panel (needs `complaints.update`; no new permission keys).
- The card shows project/site and, in its footer, a one-line summary of the current stage's section (for example
  "Hearing Dec 3, 2026 · Virtual").
- Complaints created before this change stay valid: every new field is optional, no migration.
- Audit: `complaint.updated` also covers the incident fields; `complaint.stage_moved` carries the section saved with
  the move; `complaint.stage_details_updated` records before and after of one section.
- API: `PATCH /api/complaints/[id]/stage` takes an optional `details` for the target stage; new
  `PATCH /api/complaints/[id]/details` (`complaints.update`) saves one section `{ organizationId, stage, details }`.
  Saving a section replaces it whole, so clearing a field clears it. The stage must exist in the catalog.

### Left to the builder

- Exact file and component names, following Recruitment's.
- The employee picker: reuse an existing one if the repo has it, otherwise a small searchable select.
- Exact retry behavior for IR numbering and whether the list view is paged.
- Wording of labels and empty states.

### Calls I made (not the user's)

- Complaints sit in the More menu as their own item below Performance, not a tab inside it.
- Visible org-wide to holders of the new permissions; not project-scoped (like Recruitment and Cases).
- Automatic `IR-####` numbering.
- Complaints are hideable and recycle-bin deletable by the Super Administrator only, like applicants.
- Working on the user's current branch, `enhancements/session-roster-attendance-payroll`, with no commit (the user's instruction).
- (Amendment) Project/Site is the existing Projects list (a `Project` record, by id), not a Location; deactivated projects are not offered for new picks; "To" and "Who" are the respondent; complainant is free text; violations and sanction are free text; hearing mode is a
  two-value choice; the stage form opens only when that stage's section is empty; incident fields are optional.

---

## Part 2 (implementation plan, module; complete, history): Complaints Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Complaints module (drag-and-drop board and list of incident reports against an employee, with HR-editable stages) below Performance in the More menu.

**Architecture:** A new `complaints` domain that mirrors Recruitment: a `Complaint` model, a `ComplaintStage` simple catalog (the board columns), a service plus three API routes, and a `/complaints` page copied in structure from `src/app/(app)/recruitment/tracking/`. Nothing existing changes except one-line registrations (catalog registry, visibility, deletion, nav, seed).

**Tech Stack:** Next.js App Router, TypeScript, Mongoose/MongoDB, Zod, Vitest (`mongodb-memory-server`), shadcn/ui, `@dnd-kit/core`.

**Spec:** Part 1 of this file. Read it and `knowledge/CHANGE_PROTOCOL.md` first. Reference implementation: `knowledge/domains/recruitment.md` and the files it names.

### Global Constraints

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

### Review Focus

1. Hidden test complaints (Super Administrator hide) must still count toward IR numbering, or a new number collides with the unique index. Tested in Task 2.
2. Two complaints created at the same moment must get different IR numbers (retry once on duplicate key). Tested in Task 2.
3. A respondent id from another organization, a nonexistent id, or a malformed id is rejected with a clean error, not a crash. Tested in Tasks 2 and 3.
4. An organization with no active complaint stage cannot create a complaint, and gets a clear error. A deactivated lowest stage is skipped. Tested in Task 2.
5. A complaint whose stage was later deactivated or removed still appears on the board, in its own column. A complaint whose respondent record is gone shows a "—" name, not a crash. Tested in Task 4.

---

#### Task 1: Complaint stage catalog

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

#### Task 2: Complaint model, validation, service, pipeline helpers

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

#### Task 3: API routes and permissions

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

#### Task 4: Page, board, list, sheet, dialog, navigation

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

#### Task 5: Docs and full verification

**Files:**
- Create: `knowledge/domains/complaints.md`, `docs/architecture/adr/ADR-054-complaints-module.md` (use the next free number if 054 is taken)
- Modify: `ARCHITECTURE.md`, `knowledge/domains/catalog.md` (fourteen to fifteen catalogs), `knowledge/README.md` if it lists domain files

- [ ] **Step 1: Write the knowledge file** in the format of `knowledge/domains/recruitment.md` (purpose, governing docs, services, models, routes, pages, tests, rules, gaps, last verified), the ADR (context, decision, consequences: separate from Cases, free-form moves, org-wide visibility, IR numbering) and an ARCHITECTURE.md section for Complaints. Update the catalog count in `catalog.md`.
- [ ] **Step 2: Full verification.** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Compare failures to the Task 1 baseline; any new failure must be fixed.
- [ ] **Step 3: Run the app** (use the `run` skill, `npm run dev`, port 4100) after `npm run db:seed`. As HR, open More > Complaints, add a complaint, drag it through all four stages, edit it, open its sheet, and reload. Check Settings > Catalogs shows "Complaint stages". Confirm a user without `complaints.read` has no menu item and gets `NoAccessState` at `/complaints`.
- [ ] **Step 4: Leave everything uncommitted** and report what changed, the baseline versus final test results, and the calls made along the way.

---

## Part 3 (implementation plan, stage details amendment): Complaint Stage Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the built Complaints module so a complaint carries incident details (project/site, description, what, where, when, complainant) and one details section per stage (NTE, hearing, sanction), filled in when the card moves or from the side panel, as in the user's mockup.

**Architecture:** Approach A from the spec. Incident fields are optional top-level fields on `Complaint`. Stage details live in one `stageDetails` object keyed by stage code; each section's fields are fixed in code by stage code (a generic section for any other code). One pure module (`stage-sections.ts`) defines the sections and validates them, and both the service and the UI read it. Everything built before (board, catalog, IR numbers, audit, permissions) is reused; no new permission keys and no migration.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, Vitest (`mongodb-memory-server`), shadcn/ui, `@dnd-kit/core`.

**Spec:** Part 1 of this file, section "Stage details (amendment, 2026-11-14)". Mockups: `docs/complaint_1.jpg`, `docs/complaint_2.jpg`. Read the spec, `knowledge/domains/complaints.md` and `docs/architecture/adr/ADR-054-complaints-module.md` first. The first plan (Part 2 of this file) is complete and is history.

### Global Constraints

- Branch: stay on `enhancements/session-roster-attendance-payroll`. The tree holds the user's uncommitted work. Edit in place with anchored edits, never revert, stash or reformat. **Do not commit.**
- Do **not** build the Actions menu, evidence upload, document generation, or the Completed/Ongoing/Pending/Overdue status legend (later phase).
- Required to add a complaint: `employeeId` and `receivedDate`. Every other new field is optional. Old complaints (without the new fields) must keep working.
- Incident fields, exact names: `project`, `description`, `what`, `where`, `incidentDate` (date), `complainantName`, `remarks` (existing). "Who"/"To" are the respondent; no extra field.
- `stageDetails` keys by stage code; sections exactly:
  - `nte_scheduled`: `date`, `violations`, `sentDate`, `remarks`
  - `administrative_hearing`: `date`, `hearingDate`, `mode` (`face_to_face` | `virtual`), `sentDate`, `remarks`
  - `sanction`: `date`, `sanction`, `sentDate`, `remarks`
  - any other code (including `received`): generic `date`, `sentDate`, `remarks`
- Text limits: `project` 200, `complainantName` 200, `where` 300, `description`/`what`/`violations`/`sanction`/`remarks` 1000. Dates are calendar days (UTC midnight, shown in UTC like `receivedDate`). Text is trimmed; a blank field is stored as absent.
- Saving a section replaces it whole (clearing a field clears it). The target stage must exist in the catalog (`ComplaintStageService.assertValidCode`).
- A move to a stage whose section is empty opens that stage's form (Save and move / Move without details; closing cancels, and the card must not move optimistically before the form answers). A stage whose section already has data moves straight away.
- Moves stay free-form in any direction. Every read and write filters by `organizationId`. Permissions unchanged: `complaints.update` for every write.
- Audit: `complaint.updated` covers the incident fields; `complaint.stage_moved` carries the details saved with the move; new `complaint.stage_details_updated` records before and after of one section.
- Existing standards tests must keep passing (`tests/standards`, `tests/security/route-guards.test.ts`, nav tests).

### Review Focus

1. A section saved for a stage code that is not in the catalog, an unknown key inside a section (for example `mode` on the NTE section), a `mode` other than the two values, and an over-long text are rejected with a clean 400, not stored or a crash. Tested in Tasks 1–3.
2. An old complaint with none of the new fields renders on the board, in the list and in the side panel without error, and can still be edited. Tested in Task 4.
3. Clearing a field in an edit (blank text, blank date) actually clears it, for both the incident fields and a section. Tested in Tasks 2 and 4.
4. Closing the stage form cancels the move: no request is sent and the card stays; "Move without details" moves it with no section written; moving to a stage whose section is already filled sends no form. Tested in Task 4.
5. A complaint in a stage that was retired from the catalog can still have its sections shown and edited in the side panel, and its existing sections are not lost. Tested in Tasks 2 and 4.

---

#### Task 1: Stage sections (pure module)

**Files:**
- Create: `src/domains/complaints/stage-sections.ts`
- Test: `tests/domains/complaints/stage-sections.test.ts`

**Interfaces:**
- Produces:
  - `type SectionField = { key: string; label: string; kind: "date" | "text" | "textarea" | "choice"; options?: { value: string; label: string }[]; maxLength?: number }`
  - `type StageDetails = Record<string, string | Date | undefined>`
  - `sectionFields(stageCode: string): SectionField[]` (the specific fields for the three known codes, else the generic ones; labels from the mockup: "Date", "Violations (based on the company code of conduct)", "Date sent by email", "Remarks", "Possible date of hearing", "Hearing mode" with options "Face to face" / "Virtual", "Sanction on the violations")
  - `parseStageDetails(stageCode: string, raw: unknown): StageDetails` (zod, strict per section: trims text, drops blank values, coerces dates, throws the repo's validation error on an unknown key, a bad choice or an over-long text)
  - `hasSectionData(details: StageDetails | null | undefined): boolean` (true when at least one value is present)
  - `summarizeSection(stageCode: string, details: StageDetails | null | undefined): string` (one line for a card footer: the hearing date, or else the date, formatted like `formatReceived`, plus the mode label for hearings; empty string when there is no data)

- [ ] **Step 1: Write the failing tests** in `stage-sections.test.ts`: `sectionFields("administrative_hearing")` keys equal `["date","hearingDate","mode","sentDate","remarks"]`; `nte_scheduled` keys `["date","violations","sentDate","remarks"]`; `sanction` keys `["date","sanction","sentDate","remarks"]`; an unknown code and `"received"` give `["date","sentDate","remarks"]`. `parseStageDetails("nte_scheduled", { date: "2026-11-20", violations: "  Tardiness ", sentDate: "", remarks: "" })` returns `date` as a Date at UTC midnight, `violations` `"Tardiness"` and no `sentDate`/`remarks` keys. It throws for `{ mode: "virtual" }` on the NTE section, for `{ mode: "phone" }` on the hearing section, and for a 1001-character `remarks`. `hasSectionData(undefined)` and `hasSectionData({})` are false; `summarizeSection("administrative_hearing", { hearingDate: new Date("2026-12-03"), mode: "virtual" })` is `"Dec 3, 2026 · Virtual"`; with no data it is `""`.
- [ ] **Step 2: Run it; confirm it fails** (`npx vitest run tests/domains/complaints/stage-sections.test.ts`): module missing.
- [ ] **Step 3: Implement** the module. One definition table of fields drives `sectionFields` and the zod schema built in `parseStageDetails`. Use the error class other validation uses (check `@/shared/errors`).
- [ ] **Step 4: Run it; confirm it passes.**

#### Task 2: Model, validation and service

**Files:**
- Modify: `src/server/db/models/complaint.ts`, `src/shared/validation/complaint.ts`, `src/domains/complaints/complaint-service.ts`
- Test: `tests/domains/complaints/complaint-service.test.ts` (extend), `tests/domains/complaints/complaint-validation.test.ts` (new, only if the existing tests do not already cover the schema)

**Interfaces:**
- Consumes: Task 1 (`parseStageDetails`, `hasSectionData`).
- Produces:
  - `Complaint` model gains optional strings `project`, `description`, `what`, `where`, `complainantName`, optional date `incidentDate`, and `stageDetails` (`Schema.Types.Mixed`, default absent, call `markModified("stageDetails")` when changed).
  - `complaintSchema` (zod) gains `project`, `description`, `what`, `where`, `complainantName` (trimmed, max per Global Constraints, optional) and `incidentDate` (`z.coerce.date().optional()`, an empty value allowed as absent; follow how `receivedDate` and other optional dates are handled elsewhere in `src/shared/validation`).
  - `saveComplaintStageDetailsSchema = { organizationId: objectId(), stage: trimmed string 1–200, details: z.record(z.string(), z.unknown()) }`; `moveComplaintStageSchema` gains optional `details: z.record(z.string(), z.unknown()).optional()`.
  - `ComplaintService.update(...)` also writes the incident fields (full replace; absent clears), and its audit before/after snapshot includes them.
  - `ComplaintService.saveStageDetails(id: string, organizationId: string, patch: { stage: string; details: unknown }, actor: { userId?: string })`: validates the stage with `assertValidCode`, parses with `parseStageDetails`, replaces `stageDetails[stage]` (deletes the key when the parsed section is empty), saves, audits `complaint.stage_details_updated` (`before`/`after` = that section), returns the complaint.
  - `ComplaintService.moveStage(id, organizationId, patch: { stage: string; details?: unknown }, actor)`: unchanged behaviour when `details` is absent; when present, writes the section in the same save and puts it in the `complaint.stage_moved` audit `after`.

- [ ] **Step 1: Write failing tests** (extend `complaint-service.test.ts`, same setup): `create` stores incident fields and a blank string is not stored; `update` changes them and a blank clears one (Review Focus 3), with the audit `complaint.updated` before/after holding `project`/`complainantName`; `saveStageDetails` on `administrative_hearing` stores the section and writes `complaint.stage_details_updated` with before/after; saving again with a blank `mode` clears it; an unknown stage code, `{ mode: "phone" }` and an unknown key throw and store nothing (Review Focus 1); a section saved for a retired (deactivated) stage that exists in the catalog still saves and is returned (Review Focus 5); `moveStage` with `details` writes the section and the stage in one save and the `complaint.stage_moved` audit `after` includes it; `moveStage` with invalid `details` throws and leaves the stage unchanged; a different organization gets NotFound; an old complaint (created without the new fields) can be updated and have a section saved.
- [ ] **Step 2: Run it; confirm it fails.**
- [ ] **Step 3: Implement** the model fields, the schemas and the three service changes. Keep `snapshot` as the single place that lists audited incident fields.
- [ ] **Step 4: Verify.** `npx vitest run tests/domains/complaints` passes, then `npm run typecheck`.

#### Task 3: API routes

**Files:**
- Modify: `src/app/api/complaints/route.ts`, `src/app/api/complaints/[id]/route.ts`, `src/app/api/complaints/[id]/stage/route.ts`
- Create: `src/app/api/complaints/[id]/details/route.ts`
- Test: `tests/app/api/complaint-routes.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 service and schemas, `requirePermission`, `toErrorResponse`.
- Produces: the POST and PATCH `[id]` routes accept the incident fields through the updated schema; `PATCH /api/complaints/[id]/stage` accepts an optional `details` and passes it to `moveStage`; `PATCH /api/complaints/[id]/details` (`complaints.update`) validates with `saveComplaintStageDetailsSchema`, calls `saveStageDetails`, returns `{ complaint }`.

- [ ] **Step 1: Write failing route tests** (same mocking as the existing file): the details route calls `requirePermission("complaints.update", orgId)`; a denied permission returns 403 and the service is not called; an invalid body (missing `stage`) returns 400; a service validation error for a bad `mode` surfaces as 400 (Review Focus 1); the stage route forwards `details`; POST forwards `project` and `complainantName`.
- [ ] **Step 2: Run; confirm failure.**
- [ ] **Step 3: Implement** the changes and the new route as an analogue of the stage route.
- [ ] **Step 4: Verify.** `npx vitest run tests/app/api tests/security/route-guards.test.ts` pass.

#### Task 4: UI

**Files:**
- Create: `src/app/(app)/complaints/stage-details-form.tsx` (one form driven by `sectionFields(stageCode)`), `src/app/(app)/complaints/stage-move-dialog.tsx`
- Modify: `complaint-form-dialog.tsx`, `complaint-card.tsx`, `complaint-list.tsx`, `complaint-sheet.tsx`, `complaint-pipeline.tsx`, `kanban-board.tsx` (only if needed to route drops through the pipeline's move handler), `page.tsx`, `tests/standards/mutation-feedback.test.ts` (only if a new client file needs an entry; prefer satisfying the rules)
- Test: `tests/app/complaint-pipeline.test.tsx` (extend), `tests/app/complaint-stage-details.test.tsx` (new)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `ComplaintCardData` gains `project?`, `description?`, `what?`, `where?`, `incidentDate?` (ISO string), `complainantName?`, and `stageDetails?: Record<string, Record<string, string>>` (dates as ISO strings). `page.tsx` serialises them (Dates to ISO strings, `stageDetails` converted the same way; absent when empty).
  - `ComplaintFormValue` gains the incident fields; the form dialog gains Project/Site, Brief description, What, Where, Date of incident, Complainant name and keeps Remarks (placeholder "e.g. Employee / Unit owner / Tenant / Affiliate"), under the existing required respondent and received date; it sends the new fields, with blank values omitted on create and sent blank on edit so they clear.
  - `StageDetailsForm({ stageCode, stageName, initial, onSubmit, ... })` renders the fields of `sectionFields(stageCode)` with the repo's form components and the spinner and toast rules.
  - `StageMoveDialog`: opened by the pipeline when a card moves to a stage whose section is empty (`hasSectionData` false) and `sectionFields` is the stage's; buttons "Save and move" (PATCH `/api/complaints/<id>/stage` with `{ organizationId, stage, details }`), "Move without details" (PATCH with no `details`), closing cancels (no request).
  - Card: shows the project/site line when present and, in the footer, `summarizeSection(complaint.stage, complaint.stageDetails?.[complaint.stage])` when it is non-empty (otherwise the received date as now).
  - Side panel: a Details section listing the incident fields (blank ones shown as "—"), then one block per stage (every catalog stage plus any stage the complaint holds a section for) with its filled fields or "Not filled in yet" and, for `canUpdate`, an Edit button opening `StageDetailsForm` that PATCHes `/api/complaints/<id>/details` and toasts "Details saved". The stage track and the existing edit dialog stay.
  - List view: adds Project/Site and Complainant columns.

- [ ] **Step 1: Write failing tests.** In `complaint-stage-details.test.tsx` and the extended pipeline test: moving a card (the "Move to" menu and a drop) to an empty-section stage opens the form and sends nothing until a button is pressed; "Save and move" sends the stage PATCH with `details`; "Move without details" sends it without `details`; closing the form sends no request and the card stays in its column (Review Focus 4); moving to a stage whose section is filled sends the PATCH directly with no form; the side panel shows each stage block with "Not filled in yet" for empty ones and Edit saves via `/api/complaints/<id>/details`; the add dialog sends project and complainant name; the edit dialog clears a blanked field (Review Focus 3); an old complaint with none of the new fields renders on board, list and panel and can be edited (Review Focus 2); a complaint in a retired stage still shows and edits its sections (Review Focus 5); a mode choice other than the two is not offered.
- [ ] **Step 2: Run; confirm failure.**
- [ ] **Step 3: Implement.** Keep the optimistic move for stages with no form to open (so today's behaviour is unchanged there); for a stage that opens the form, move the card only after the request succeeds (the pipeline already refreshes on success). Reuse existing form, button and dialog components; follow `complaint-form-dialog.tsx` for spinner, toast, test ids (`complaint-stage-form-save`, `complaint-stage-form-skip`, etc.).
- [ ] **Step 4: Verify.** `npx vitest run tests/app tests/standards` pass, then `npm run typecheck && npm run lint`.

#### Task 5: Docs and verification

**Files:**
- Modify: `docs/architecture/adr/ADR-054-complaints-module.md` (add an "Amendment 2026-11-14" section: stage details approved, approach A, Actions menu and status legend deferred, the old rule "no NTE/hearing/sanction fields" superseded), `knowledge/domains/complaints.md` (fields, services, routes, rules, gaps; replace the rule "A complaint holds only IR number, respondent, date received, remarks and stage"), `ARCHITECTURE.md` (the Complaints section), Part 1 of this file (only if the build forced a change)

- [ ] **Step 1: Update the docs** as listed. In the knowledge file, name the new files and the three Known gaps: a stage added by HR gets only the generic section; violations and sanction are free text; Actions and Overdue are not built.
- [ ] **Step 2: Full verification.** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Report every failure by name, including one you did not cause.
- [ ] **Step 3: Live run.** Do **not** run `npm run db:seed` (it writes to the database in `.env.local`); ask the user first. If the user has seeded, run the app with the `run` skill and check: add a complaint with incident details, drag it to NTE and fill the form, drag to Hearing and skip, open the panel and edit a section, reload.
- [ ] **Step 4: Leave everything uncommitted** and report: what changed, test results, the calls made, and what was not verified live.
