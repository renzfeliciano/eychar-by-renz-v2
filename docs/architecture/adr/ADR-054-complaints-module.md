# ADR-054: Complaints module

## Status

Accepted. Mirrors the Recruitment module (ADR-015) and uses the catalog pattern (ADR-016, ADR-045).

## Context

HR handles incident reports (IR) and complaints about employees as a process: the report is received,
a date is set for a notice to explain (NTE), an administrative hearing is held, and a sanction is
decided. There was no place to track where each complaint stands. The existing Cases module is a
legal register tied to a project, not to an employee, and has a different purpose.

## Decision

- **A separate `complaints` domain** (`src/domains/complaints/`) that copies Recruitment's shape: a
  `Complaint` model, a `ComplaintStage` simple catalog for the board columns, a service, three routes
  and a drag-and-drop board and list at `/complaints`. Cases and Applicant are not reused or changed.
- **A complaint holds only:** automatic IR number (`IR-` plus four digits, unique per organization),
  respondent (an employee of the organization), date received, optional remarks, and stage. The NTE
  date, hearing date and sanction are not fields; the stage shows where a complaint stands.
- **Stages are data.** Seeded as `received`, `nte_scheduled`, `administrative_hearing`, `sanction`
  (`isTerminal`), editable in Settings > Catalogs. Moves are free-form in any direction with no required
  dates. A new complaint starts in the lowest-sorted active stage read from the catalog, never a
  hard-coded code.
- **IR numbers** are the highest existing number plus one, counting hidden test complaints and complaints in
  the recycle bin too (a reused number would make restoring a deleted complaint fail), with the unique
  index as the guard and a retry on a duplicate. Production does not build indexes at runtime, so a deploy
  that adds this module must run `npx tsx scripts/sync-indexes.ts` (it picks up the new model on its own);
  until then two complaints added at the same moment can share a number.
- **Access:** `complaints.create|read|update` and `complaint-stages.create|read|update`, organization-wide
  (not project-scoped), seeded to the HR role like every other permission. Complaints never appear in
  employee self-service.
- **No delete route.** A complaint is retired by moving it to a closing stage. The Super Administrator
  can hide one as test data (ADR-034) or delete it from the recycle bin (ADR-033).
- **Audit:** `complaint.created`, `complaint.updated` (before and after of respondent, date and remarks),
  `complaint.stage_moved`.

## Amendment 2026-11-14: stage details

The user's mockups (`docs/complaint_1.jpg`, `docs/complaint_2.jpg`) show each stage with its own fields,
which supersedes "a complaint holds only IR number, respondent, date received, remarks and stage".

- **Incident details** (optional, top level on the complaint): project/site (a dropdown of the organization's existing Projects, stored as `projectId`; user decision), brief description, what,
  where, date of the incident, complainant name (free text: complainants may be tenants or unit
  owners), and the existing remarks. "Who" and "To" are the respondent. Respondent and date received
  stay the only required fields.
- **Stage details** (optional, `stageDetails` keyed by stage code, field sets fixed in code by stage
  code): NTE (date, violations, date sent by email, remarks), Administrative Hearing (date, possible
  hearing date, mode face to face or virtual, date sent, remarks), Sanction (date, sanction, date sent,
  remarks). Any other stage gets a generic section (date, date sent, remarks). Violations and sanction
  are free text; a code-of-conduct catalog is a possible later change.
- **Approach:** details stored on the complaint with the sections fixed in code (A). Rejected: fields
  configured per stage in the catalog (needs a form builder) and a separate record per stage entry (a
  full history, heavier than the mockup needs).
- **Behaviour:** moving a card to a stage whose section is empty opens that stage's form (save and
  move, or move without details; closing it cancels the move). The first stage never asks, because its
  details are the incident fields. Sections are editable from the side panel at any time.
- **Deferred by the user:** the Actions menu (issue NTE, upload evidence, schedule hearing, record
  minutes, generate decision and sanction notice, close case) and the Completed/Ongoing/Pending/Overdue
  status legend.
- No new permission keys and no migration: every new field is optional, so existing complaints stay valid.
  New audit action `complaint.stage_details_updated`.

## Consequences

- Adding another disciplinary step later is a catalog change, not a deploy.
- Deleting an employee does not remove or block their complaints; a complaint whose respondent record is
  gone shows "—" for the name. Whether employee deletion should take complaints with it, like it does
  performance evaluations, is left open.
- A stage HR adds later gets only the generic details section; its own fields would need a code change (approach A).
- Catalog `metadata` is write-once (see knowledge/domains/catalog.md), so `isTerminal` on the Sanction
  stage is fixed when the item is created; a stage HR adds later cannot be flagged closed.
