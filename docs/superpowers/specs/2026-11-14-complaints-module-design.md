# Complaints module (design)

Status: approved. Branch: `enhancements/session-roster-attendance-payroll` (the user's current branch; no new branch).
The working tree already holds the user's uncommitted work, so this change edits files in place and is not committed
unless the user asks.

## Intent and why

HR needs a place to track incident reports (IR) and complaints about an employee as they move through
a disciplinary process. The user wants it to work like the Recruitment module: a board HR drags
cards across, where the columns are data HR can edit. The four starting stages are the steps HR
already follows: **Received IR/complaint**, **Set a date for NTE**, **Administrative Hearing**,
**Sanction**.

The user has not said why beyond "like Recruitment"; the intent above is taken from their request.

## Goals

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

## Non-goals and anti-goals

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

## Constraints

- Follow `docs/ENGINEERING.md` and `knowledge/CHANGE_PROTOCOL.md`: logic in a domain service, route handlers
  only orchestrate, authorization on the server, catalogs hold meaning (§2, §37, §55).
- Everything is scoped by `organizationId`. Respondent must be an employee of the same organization.
- Existing behavior and data do not change. All new collections, so no migration. Seed stays idempotent (§53).
- Stage codes are never hard-coded as an enum. What a stage means comes from catalog metadata (ADR-045).

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | New `complaints` domain that mirrors Recruitment | Most new files; nothing existing changes; matches repo patterns |
| B | Reuse the Applicant model with a type flag | Mixes confidential disciplinary data with recruitment reads; Applicant requires a position and carries contact fields |
| C | Extend Cases with an employee and a board | Changes a working module with a different purpose (project legal register) |

The user was told A is the recommendation and was asked for changes; none were given.

## Design (approach A)

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

## Stage details (amendment, 2026-11-14)

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

## Left to the builder

- Exact file and component names, following Recruitment's.
- The employee picker: reuse an existing one if the repo has it, otherwise a small searchable select.
- Exact retry behavior for IR numbering and whether the list view is paged.
- Wording of labels and empty states.

## Calls I made (not the user's)

- Complaints sit in the More menu as their own item below Performance, not a tab inside it.
- Visible org-wide to holders of the new permissions; not project-scoped (like Recruitment and Cases).
- Automatic `IR-####` numbering.
- Complaints are hideable and recycle-bin deletable by the Super Administrator only, like applicants.
- Working on the user's current branch, `enhancements/session-roster-attendance-payroll`, with no commit (the user's instruction).
- (Amendment) Project/Site is the existing Projects list (a `Project` record, by id), not a Location; deactivated projects are not offered for new picks; "To" and "Who" are the respondent; complainant is free text; violations and sanction are free text; hearing mode is a
  two-value choice; the stage form opens only when that stage's section is empty; incident fields are optional.
