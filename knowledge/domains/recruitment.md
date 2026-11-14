# Recruitment

**Purpose:** applicant tracking. Records people who applied for a Position, moves them through catalog-defined pipeline stages (a Kanban board), and marks outcomes. A hire here is a stage only: it does not create an Employee (see `workforce.md` for the hire flow).
**Governing docs:** ADR-015 (recruitment mirrors the legacy v1 Application Tracking), ARCHITECTURE.md § Recruitment (Phase 8a, ADR-015), ENGINEERING.md § 54 (seed data: stages are configuration), § 37 (domain services), § 46 (tests).
**Services:**
- `src/domains/recruitment/applicant-service.ts`: `ApplicantService.create`, `update` (full edit), `moveStage` (free-form to any configured stage), `listForOrganization(orgId, { stage })`. Private `assertPositionValid`.
- `src/domains/recruitment/pipeline.ts` (pure, no DB): `filterApplicants`, `daysSince`, `describeApplied`, `isHiredStage`, `stageTone`, `LEGACY_HIRED_STAGE_CODES` (`"hired"`).
- `src/domains/recruitment/default-stages.ts`: `DEFAULT_RECRUITMENT_STAGES`, the stages `npm run db:seed` gives an organization (applied, screening, interview, offer, hired, rejected, three withdrawal outcomes, did_not_proceed). Meaning comes from `metadata.isTerminal` and `metadata.isHired`.
- The stage catalog itself is `src/domains/catalog/recruitment-stage-service.ts` (`RecruitmentStageService.assertValidCode`).

**Models:**
- `src/server/db/models/applicant.ts` (`ApplicantModel`): `positionId` (required, ref Position), `applicantName`, `email`, `phone`, `stage` (plain string, default `applied`), `appliedDate`, `remarks`. Indexes on `(organizationId, positionId)` and `(organizationId, stage)`. Hidden plugin applied.
- `src/server/db/models/recruitment-stage.ts`: catalog item (see the catalog domain).
- Reads `PositionModel` for the position check (`src/server/db/models/position.ts`).

**Routes:**
- `src/app/api/applicants/route.ts`: GET (`applicants.read`, optional `stage` filter), POST (`applicants.create`).
- `src/app/api/applicants/[id]/route.ts`: PATCH (`applicants.update`), full edit.
- `src/app/api/applicants/[id]/stage/route.ts`: PATCH (`applicants.update`), stage move.
- No DELETE route. Applicants are retired by moving them to a closing stage.

**Pages:**
- `src/app/(app)/recruitment/tracking/page.tsx` (board and list), `applicant-pipeline.tsx`, `kanban-board.tsx` (drag-and-drop), `stage-column.tsx` (drop target), `applicant-card.tsx` (draggable), `applicant-list.tsx` (table view), `applicant-sheet.tsx` (detail), `applicant-form-dialog.tsx` (create and edit), `loading.tsx`.
- Both drag-and-drop and the "Move to" select call `PATCH /api/applicants/[id]/stage` (ARCHITECTURE.md § Recruitment).

**Tests:**
- `tests/domains/recruitment/applicant-service.test.ts`
- `tests/domains/recruitment/pipeline.test.ts`
- `tests/app/applicant-pipeline.test.tsx`

**Rules a change must respect:**
- Stage codes are never hard-coded as an enum. Every write checks `RecruitmentStageService.assertValidCode` (`applicant-service.ts`, lines 21 and 87).
- **`create` hard-codes the stage `"applied"`** (`applicant-service.ts` lines 21 and 31). If HR deactivates or renames that catalog code, new applicants fail. Keep it in step with `DEFAULT_RECRUITMENT_STAGES`, or change `create` to read a configured default.
- Moves are free-form in any direction (`moveStage` comment, lines 75-80). Do not add a forward-only check without changing ARCHITECTURE.md § Recruitment too.
- What a stage means is its catalog metadata, not its code. `stageTone` reads `isHired` first, then falls back to the legacy code `"hired"`. `isHired: false` on a withdrawal stage must stay non-success (`pipeline.ts`, lines 157-172).
- A hire does not create an Employee, Employment or Assignment. The Offboarding and hire flows are separate (ARCHITECTURE.md § Recruitment).
- Every write is audited (`applicant.created`, `applicant.updated`, `applicant.stage_moved`), with before and after for stage moves.
- Applicants are hidden-plugin scoped, so Super Administrator hiding (see `visibility.md`) removes them from everyone else's reads.

**Known gaps / mismatches:**
- `ApplicantService.update` audit `after` records only `positionId`. Name, email and phone changes are not in the audit trail. This is inconsistent with `moveStage`, which records before and after.
- `ApplicantService.update` does not check the applicant's current stage. Editing a `hired` or withdrawn applicant is allowed, which is consistent with free-form movement but means the outcome record can change without a stage move.
- `listForOrganization` returns every applicant with no pagination. Acceptable at current scale, but it is the same in-memory pattern ARCHITECTURE.md § People roster paging says to move away from.
- `ApplicantService.create` (line 21) assumes a stage code that the org may have removed (see Rules).

**Last verified:** 6587050.
