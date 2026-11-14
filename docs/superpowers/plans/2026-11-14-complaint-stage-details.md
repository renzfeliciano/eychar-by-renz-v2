# Complaint Stage Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the built Complaints module so a complaint carries incident details (project/site, description, what, where, when, complainant) and one details section per stage (NTE, hearing, sanction), filled in when the card moves or from the side panel, as in the user's mockup.

**Architecture:** Approach A from the spec. Incident fields are optional top-level fields on `Complaint`. Stage details live in one `stageDetails` object keyed by stage code; each section's fields are fixed in code by stage code (a generic section for any other code). One pure module (`stage-sections.ts`) defines the sections and validates them, and both the service and the UI read it. Everything built before (board, catalog, IR numbers, audit, permissions) is reused; no new permission keys and no migration.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose, Zod, Vitest (`mongodb-memory-server`), shadcn/ui, `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-11-14-complaints-module-design.md`, section "Stage details (amendment, 2026-11-14)". Mockups: `docs/complaint_1.jpg`, `docs/complaint_2.jpg`. Read the spec, `knowledge/domains/complaints.md` and `docs/architecture/adr/ADR-054-complaints-module.md` first. The first plan (`2026-11-14-complaints-module.md`) is complete and is history.

## Global Constraints

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

## Review Focus

1. A section saved for a stage code that is not in the catalog, an unknown key inside a section (for example `mode` on the NTE section), a `mode` other than the two values, and an over-long text are rejected with a clean 400, not stored or a crash. Tested in Tasks 1–3.
2. An old complaint with none of the new fields renders on the board, in the list and in the side panel without error, and can still be edited. Tested in Task 4.
3. Clearing a field in an edit (blank text, blank date) actually clears it, for both the incident fields and a section. Tested in Tasks 2 and 4.
4. Closing the stage form cancels the move: no request is sent and the card stays; "Move without details" moves it with no section written; moving to a stage whose section is already filled sends no form. Tested in Task 4.
5. A complaint in a stage that was retired from the catalog can still have its sections shown and edited in the side panel, and its existing sections are not lost. Tested in Tasks 2 and 4.

---

### Task 1: Stage sections (pure module)

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

### Task 2: Model, validation and service

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

### Task 3: API routes

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

### Task 4: UI

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

### Task 5: Docs and verification

**Files:**
- Modify: `docs/architecture/adr/ADR-054-complaints-module.md` (add an "Amendment 2026-11-14" section: stage details approved, approach A, Actions menu and status legend deferred, the old rule "no NTE/hearing/sanction fields" superseded), `knowledge/domains/complaints.md` (fields, services, routes, rules, gaps; replace the rule "A complaint holds only IR number, respondent, date received, remarks and stage"), `ARCHITECTURE.md` (the Complaints section), `docs/superpowers/specs/2026-11-14-complaints-module-design.md` (only if the build forced a change)

- [ ] **Step 1: Update the docs** as listed. In the knowledge file, name the new files and the three Known gaps: a stage added by HR gets only the generic section; violations and sanction are free text; Actions and Overdue are not built.
- [ ] **Step 2: Full verification.** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Report every failure by name, including one you did not cause.
- [ ] **Step 3: Live run.** Do **not** run `npm run db:seed` (it writes to the database in `.env.local`); ask the user first. If the user has seeded, run the app with the `run` skill and check: add a complaint with incident details, drag it to NTE and fill the form, drag to Hearing and skip, open the panel and edit a section, reload.
- [ ] **Step 4: Leave everything uncommitted** and report: what changed, test results, the calls made, and what was not verified live.
