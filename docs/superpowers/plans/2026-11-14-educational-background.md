# Educational background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, chosen by the owner) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let HR record each employee's academic qualifications (level, school, course, year graduated), several per level, in an Educational background card on the profile.

**Architecture:** A new `EducationRecord` collection keyed by person, a small domain service, three thin routes under `/api/employees/[id]/education`, and an Overview card with add, edit and remove dialogs. The level list is the existing `education-levels` catalog.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-14-educational-background-design.md` (approved 2026-11-14).

## Global Constraints

- `employees.update` changes entries; `employees.read` (already required by the profile) sees them. No new permission key.
- A record: `levelCode` (required, an active catalog code on create, and on update only when it changes), `school` (required, trimmed, max 200), `course` (optional, max 200), `yearGraduated` (optional integer, 1900 up to next calendar year in the organization's zone).
- Entries belong to the **person**; every query is scoped by `organizationId` and `personId`; the employee id in the URL is resolved to its person inside the organization.
- Order: the level's catalog `sortOrder`, then `yearGraduated` ascending, blank years last.
- Audit `education-record.created`, `.updated`, `.removed` with before and after. Removal is a plain delete.
- The highest-level dropdown and the entries are independent; nothing reconciles them.
- Staging only, never commit (owner: "I will commit it all later").

## Review Focus

- Another organization's employee id reads as not found on every route. Pinned in Tasks 1 and 2.
- An entry whose level HR later retired still lists, and its school or year can still be edited. Pinned in Task 1.
- Year 0, 1899, a far-future year, a non-integer and a text year are refused with a clear message. Pinned in Task 1.
- A blank course and a blank year are stored as absent, never as empty strings. Pinned in Task 1.
- Removing an entry that belongs to a different person of the same organization is refused. Pinned in Task 1.

---

### Task 1: Model and service

**Files:** Create `src/server/db/models/education-record.ts`, `src/domains/people/education-record-service.ts`; modify `src/server/db/models/index.ts`; test `tests/domains/people/education-record-service.test.ts`.

**Interfaces:**
- Produces: `EducationRecordModel`; `EducationRecordService.listForPerson(personId: string, organizationId: string)`, `.create(input: { organizationId; employeeId; levelCode; school; course?; yearGraduated? }, actor)`, `.update(recordId, organizationId, patch: { levelCode?; school?; course?: string; yearGraduated?: number | null }, actor)`, `.remove(recordId, organizationId, actor)`, `.listForEmployee(employeeId, organizationId)` (resolves the person; ordered per Global Constraints). `""` for course and `null` for year mean "clear".

- [ ] **Step 1: Write the failing tests** (names and assertions): creates and lists in level-then-year order with blank years last; stores blank course and year as absent; refuses a missing school, an unknown level once the catalog is set up, and years 0, 1899, next-year-plus-one, 2001.5 and "abc"; allows year equal to next year and 1900; update changes school on an entry whose level was retired, but refuses switching to a retired level; update clears course and year; remove deletes and audits; remove of another person's entry in the same organization is refused (`NotFoundError`); every method reads another organization's id as not found; audit actions and before/after.
- [ ] **Step 2: Run** `npx vitest run tests/domains/people/education-record-service.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the model (indexed `{ organizationId, personId }`) and the service, using `EducationLevelService.assertValidCode` and `localDateKey` for next year.
- [ ] **Step 4: Run** the file and `npx vitest run tests/domains/people`. Expected: PASS.
- [ ] **Step 5: Stage** the files.

### Task 2: Validation and routes

**Files:** Modify `src/shared/validation/workforce.ts` (or create `education.ts`); create `src/app/api/employees/[id]/education/route.ts` and `[recordId]/route.ts`; test `tests/app/api/education-routes.test.ts`.

**Interfaces:**
- Consumes: Task 1 service.
- Produces: `createEducationRecordSchema` and `updateEducationRecordSchema` (same field rules as Global Constraints; update fields all optional); `POST /api/employees/[id]/education` (201, `{ record }`), `PATCH` and `DELETE /api/employees/[id]/education/[recordId]` (200).

- [ ] **Step 1: Write the failing route tests** in the style of `employment-and-evaluation-routes.test.ts` (real DB, fake session): 201/200 happy paths, 403 for a user with only `employees.read`, 400 for a malformed id or body, 404 for another organization, 401 with no session.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** schemas and routes (`requirePermission("employees.update", organizationId)`, `toErrorResponse`). **Step 4: Run** the file plus `npx vitest run tests/security`. Expected: PASS. **Step 5: Stage.**

### Task 3: The card and dialogs

**Files:** Create `src/app/(app)/people/[id]/education-background-card.tsx` and `education-record-dialog.tsx`; tests `tests/app/education-background-card.test.tsx`, `tests/app/education-record-dialog.test.tsx`.

**Interfaces:**
- Consumes: routes from Task 2; `educationLevelOptions`, `educationLevelName`.
- Produces: `EducationBackgroundCard({ organizationId, employeeId, records: EducationRecordView[], levels: EducationLevelItem[], canUpdate: boolean })` where `EducationRecordView = { id: string; levelCode: string; school: string; course: string | null; yearGraduated: number | null }`; `EducationRecordDialog({ organizationId, employeeId, levels, record?: EducationRecordView })` (add when no `record`). Test ids: `education-add-button`, `education-level`, `education-submit`, per-row `education-edit-{id}`, `education-remove-{id}`.

- [ ] **Step 1: Write the failing tests:** card lists rows with the level's name, school, course and year, and a dash for blanks; empty state; no controls without `canUpdate`; add sends the body and refreshes; edit pre-fills; a retired level still shows on its row and in its edit dialog; remove asks to confirm then deletes; server errors show in the dialog; a year outside the range is refused before sending.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** following `edit-employee-dialog.tsx` and `end-employment-dialog.tsx`. **Step 4: Run.** Expected: PASS. **Step 5: Stage.**

### Task 4: Profile wiring, docs, verification

**Files:** Modify `src/app/(app)/people/[id]/page.tsx`; update `docs/architecture/adr/ADR-019-employee-roster-v1-fields.md` (addendum), `knowledge/domains/people.md`.

- [ ] **Step 1:** In the page, load `EducationRecordService.listForEmployee`, build `EducationRecordView[]`, and render the card in Overview under the personal details, passing `canUpdate`.
- [ ] **Step 2:** Add the ADR addendum and the knowledge lines (model, service, routes, rules).
- [ ] **Step 3: Verify:** `npm run typecheck`; `npx eslint` on the changed paths; `(npm run test:ui; npm run test:domains; npm run test:core)`, reporting every failure by name. Expected: new tests pass, no previously green test turns red.
- [ ] **Step 4: Stage** the files.

## Self-review

- Spec coverage: data and validation (Task 1), service rules and audit (Task 1), API (Task 2), card and dialogs (Task 3), profile placement, docs (Task 4). Non-goals have no task.
- Types: `EducationRecordView`, `EducationLevelItem` and the service method names are identical wherever used.
