# ADR-015: Recruitment mirrors the legacy v1 app's Application Tracking

## Status

Accepted (supersedes an earlier version of this ADR)

## Context

Recruitment was first built with its own shape: a `JobOpening` entity (with `headcount`/
`status`) that `Applicant` referenced, a forward-only stage state machine driven by
`RecruitmentStage.sortOrder`/`metadata.isTerminal`, and a `hire()` action that called the
existing `HireService.hire()` to create a real `Employee` record when an applicant reached the
final pre-terminal stage.

The user asked that this module be rebuilt to match the legacy v1 app's actual, already-shipped
Application Tracking feature instead. Inspecting v1 (`src/features/recruitment/**`) showed a
materially simpler design: applicants reference a `Position` directly (no job-opening/headcount
layer at all), a card can move to **any** stage in **either** direction via a plain "Move to"
`<select>` or drag-and-drop (`@dnd-kit/core`), and moving to a "Hired"-named stage is just a
label — it never creates an `Employee` record.

## Decision

- **No `JobOpening` model.** `Applicant` (`organizationId`, `positionId`, `applicantName`,
  `email?`, `phone?`, `stage`, `appliedDate`, `remarks?`) references `Position` directly, matching
  v1's `JobApplication` shape. `applicantName` is a single field (not split first/last) — once
  the Hire integration was removed, splitting a name only a Person record would have needed no
  longer served a purpose.
- **Free-form stage movement.** `ApplicantService.moveStage()` validates the target stage exists
  in the org's `RecruitmentStage` catalog (`assertValidCode`) and nothing else — no
  `sortOrder`/`isTerminal` direction check. A card can go from "Interview" back to "Applied", or
  straight to "Rejected", exactly as v1 allows.
- **Drag-and-drop, matching v1's actual mechanism.** `@dnd-kit/core` was added as a dependency
  (an explicit, deliberate exception to this codebase's general "avoid new dependencies without
  a concrete need" restraint — the concrete need here is fidelity to v1's real, already-used
  interaction model, not a hypothetical). `KanbanBoard` wraps the columns in `DndContext`;
  `StageColumn` is a drop target (`useDroppable`); `ApplicantCard` is draggable via a grip handle
  (`useDraggable`) and still exposes the same "Move to" `<select>` as a non-drag fallback, exactly
  like v1's card does.
- **No Hire-to-Employee integration.** Moving a card to whatever stage the org has named "Hired"
  does not create a `Person`/`Employee`/`Employment`/`EmployeeAssignment` bundle. This is a
  genuine capability regression from the first version of this module, kept anyway because it
  matches v1's real, deliberate scope — v1 treats Application Tracking purely as a pipeline
  tracking tool, with actual onboarding happening separately.
- **Full edit, not narrow per-field patches.** `ApplicantService.update()` replaces every field
  in one call (same shape as `create()`), matching v1's single reused form dialog for both modes.

## Consequences

- `tests/domains/recruitment/applicant-service.test.ts` proves: a position from another
  organization is rejected, a stage can move in any direction (including backward) as long as
  it's configured, an unconfigured stage is rejected once the catalog has at least one item, a
  full edit updates every field, and listing sorts by `appliedDate` descending.
- If a later phase needs recruitment to actually produce an `Employee` record again, that's a
  new, explicit feature to design — not a revival of this ADR's original `hire()` method, since
  v1 (the fidelity target this ADR now serves) has no such concept to mirror.
