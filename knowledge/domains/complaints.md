# Complaints

**Purpose:** tracks incident reports (IR) and complaints about an employee across a drag-and-drop board whose columns are the `ComplaintStage` catalog (seeded: Received IR/complaint, Set a date for NTE, Administrative Hearing, Sanction). Each complaint holds incident details and one details section per stage (NTE, hearing, sanction), as in the user's mockups. Built to mirror Recruitment. Not the same as Cases (a project-level legal register).
**Governing docs:** ADR-054 (this module, with the 2026-11-14 stage-details amendment), ADR-015 (Recruitment, the template), ADR-016 and ADR-045 (catalogs), ADR-033 (recycle bin), ADR-034 (hidden test data), ARCHITECTURE.md § Complaints, ENGINEERING.md § 37 (domain services), § 54 (seed data). Design: `docs/superpowers/specs/2026-11-14-complaints-module-design.md`. Mockups: `docs/complaint_1.jpg`, `docs/complaint_2.jpg`.

**Services:**
- `src/domains/complaints/complaint-service.ts`: `ComplaintService.create(input, actor)`, `update(id, orgId, patch, actor)` (respondent, date received and the incident fields; never the IR number or stage), `moveStage(id, orgId, { stage, details? }, actor)` (saves that stage's section in the same step), `saveStageDetails(id, orgId, { stage, details }, actor)` (replaces one section; any catalog stage, active or not), `listForOrganization(orgId, { stage })` (newest `receivedDate` first). Private helpers: `assertRespondentValid`, `firstActiveStage`, `nextIrNumber`, `incidentValues`, `applySection`.
- `src/domains/complaints/stage-sections.ts` (pure): the field set of each stage's section (`sectionFields`), `parseStageDetails` (strict per section, trims, drops blanks, throws `ValidationError`), `hasSectionData`, `summarizeSection` (one line for the card footer), `serializeStageDetails` (for the browser).
- `src/domains/complaints/pipeline.ts` (pure): `filterComplaints`, `isClosedStage` (reads `metadata.isTerminal`), `withOrphanedStages`.
- `src/domains/complaints/default-stages.ts`: `DEFAULT_COMPLAINT_STAGES`, seeded by `npm run db:seed`.
- Catalog: `src/domains/catalog/complaint-stage-service.ts` (registry slug `complaint-stages`).

**Models:**
- `src/server/db/models/complaint.ts` (`ComplaintModel`): `employeeId` (ref Employee), `irNumber`, `receivedDate`, `remarks?`, `projectId?` (ref Project), `description?`, `what?`, `where?`, `incidentDate?`, `complainantName?`, `stage` (plain string, no default), `stageDetails?` (Mixed, one section per stage code). Indexes: unique `(organizationId, irNumber)`, `(organizationId, stage)`, `(organizationId, employeeId)`. Hidden plugin applied.
- `src/server/db/models/complaint-stage.ts` (catalog item).

**Sections (fixed in code by stage code):** `nte_scheduled`: date, violations, date sent, remarks. `administrative_hearing`: date, possible hearing date, mode (`face_to_face` | `virtual`), date sent, remarks. `sanction`: date, sanction, date sent, remarks. Any other code: date, date sent, remarks. The first stage's details are the incident fields on the complaint itself.

**Routes:**
- `src/app/api/complaints/route.ts`: GET (`complaints.read`, optional `stage`), POST (`complaints.create`).
- `src/app/api/complaints/[id]/route.ts`: PATCH (`complaints.update`), full edit of respondent, date and incident fields.
- `src/app/api/complaints/[id]/stage/route.ts`: PATCH (`complaints.update`), stage move with an optional `details` section.
- `src/app/api/complaints/[id]/details/route.ts`: PATCH (`complaints.update`), saves one stage's section.
- No DELETE route.

**Pages:** `src/app/(app)/complaints/page.tsx` with `complaint-pipeline.tsx` (search, board/list, optimistic move, all `fetch` calls), `kanban-board.tsx`, `stage-column.tsx`, `complaint-card.tsx` (project, stage summary), `complaint-list.tsx`, `complaint-sheet.tsx` (incident details and one block per stage with an Edit button), `complaint-form-dialog.tsx` (respondent, date received, the project dropdown and the other incident fields), `stage-details-dialog.tsx` (one form driven by `sectionFields`, used for a move and for editing), `loading.tsx`. Menu item in More, directly after Performance (`src/components/shared/nav-links.tsx`).

**Tests:** `tests/domains/complaints/` (`complaint-service`, `stage-sections`, `pipeline`, `complaint-stages`), `tests/app/api/complaint-routes.test.ts`, `tests/app/complaint-pipeline.test.tsx`, `tests/app/complaint-stage-details.test.tsx`, plus a case each in `tests/app/nav-permissions.test.tsx`, `tests/domains/visibility/visibility-service.test.ts` and `tests/domains/deletion/cross-organization-deletion.test.ts`.

**Rules a change must respect:**
- Project/Site is the organization's existing Projects list (`ProjectService.listCurrent`, as in Cases), stored by id and checked to belong to the organization; like the respondent it is only re-checked when changed, so a deleted project does not block an edit (the form shows "Unknown project (record removed)"). Only active projects are offered. Every viewer of complaints is sent the project names, as Cases does.
- Required to add a complaint: respondent and date received. Everything else is optional so intake is never blocked. The Actions menu (issue NTE, upload evidence, generate documents, close case) and the Completed/Ongoing/Pending/Overdue status are a later phase by the user's decision; do not add them without a new decision (ADR-054).
- Stage codes are never hard-coded in logic. Every move checks `ComplaintStageService.assertValidCode`; a new complaint starts in the lowest-sorted active stage (`firstActiveStage`). The only code-keyed thing is the field set of a details section (`stage-sections.ts`), with a generic fallback.
- Moves are free-form in any direction, with no required dates. Moving to a stage whose section is empty opens that stage's form (save and move, move without details, or close to cancel); the first stage never asks, and a filled section moves straight away. The card is not moved before the form answers.
- Saving a section replaces it whole (a blank field is cleared). The stage must be in the catalog; a deactivated stage still saves.
- IR numbers count hidden complaints (`{ includeHidden: true }`) and complaints in the recycle bin (`DeletedRecordModel`, `collectionName: "complaints"`), or a number could repeat and a restore would fail on the unique index. The unique index is the guard; `create` retries up to five times on a duplicate. **Production builds no indexes at runtime**: run `npx tsx scripts/sync-indexes.ts` on the deploy that adds this module (it covers the new model automatically), or concurrent creates can share a number.
- `update` checks the respondent only when it changed, so a complaint about an employee whose record was deleted or hidden can still be edited. The edit dialog adds that respondent as "Unknown employee (record removed)" so saving does not re-point it.
- Every read and write filters by `organizationId`; the respondent must be an employee of the same organization.
- Org-wide, not project-scoped. Never shown in employee self-service.
- Every write is audited (`complaint.created`, `.updated`, `.stage_moved` (with the section saved), `.stage_details_updated`).
- `complaint` is registered in `HIDEABLE` (`visibility-service.ts`) and `DELETABLE_TYPES` (`deletion-registry.ts`).

**Known gaps / mismatches:**
- A stage HR adds in the catalog gets only the generic section (date, date sent, remarks); custom fields per stage would need a code change.
- Violations and sanction are free text; there is no code-of-conduct catalog.
- Actions menu, evidence upload, document generation and the Overdue status are not built.
- Deleting an employee does not remove or block their complaints (performance evaluations are taken with the employee). A complaint with no respondent record shows "—".
- `listForOrganization` returns every complaint with no paging, like Recruitment.
- Catalog `metadata` is write-once, so `isTerminal` on a stage is fixed at creation (see catalog.md).
- No delete button in the UI; the recycle-bin path exists in the registry only, like applicants.
- Reviewer findings deferred as minor: a failed `fetch` (offline) on an optimistic move leaves the dragged card in the new column and the add/edit dialog on its spinner (Recruitment has the same pattern; the new stage-details dialogs do catch it and show a message); a deactivated stage that still holds complaints is a column that accepts drops which then fail with a toast, and loses its `isTerminal` look; complaints about a hidden test employee stay visible to HR as "—"; `employeeOptions` (every employee name) is sent to the browser even for a viewer who can only read complaints.
- The catalog editor never sends `sortOrder`, so a stage HR adds gets `sortOrder: 0` and sorts with the first stage; HR cannot place a new stage after Sanction or flag it closed from the UI. This is the existing catalog limitation (see catalog.md), not specific to complaints. `default-stages.ts` says HR can "reorder" stages; that is not yet true.

**Last verified:** working tree on `enhancements/session-roster-attendance-payroll` (uncommitted), 2026-11-14.
