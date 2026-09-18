# ADR-024: Events calendar, based on the legacy v1 module

## Status

Accepted

## Context

The last remaining named Phase 8 sub-phase (AGENTS.md §57) was Events — a company-wide calendar
of meetings, holidays, and deadlines. `EventCategory` (the org-managed lookup list Meeting/
Holiday/Deadline/Reminder/Other) was already seeded and manageable under Settings > Catalogs
since Phase 8's catalog foundation (ADR-016), specifically ahead of this domain existing yet. v1's
real module (`src/repositories/models/event-model.ts`, `src/schemas/event.ts`,
`src/services/event-service.ts`, `src/features/events/`) was read directly, same methodology as
every other v1-based module this phase.

## Decision

- **`Event`** (`organizationId`, `title`, `date`, `time?`, `category`, `description?`,
  `status: "active"|"cancelled"`). `category` is a plain trimmed String validated against the
  `EventCategory` catalog (`EventCategoryService.assertValidCode`), matching every other
  catalog-driven field in this app. v1 hard-deletes an event; this app never does (AGENTS.md
  §53) — `cancel()` flips `status`, and `listForMonth()` only ever returns `status: "active"`
  rows, so a cancelled event simply stops appearing on the calendar.
- **Navigation follows this app's own established convention, not v1's**: v1's `EventsModule`
  fetches a month's events client-side on every prev/next click. This app already has the
  identical need solved differently — `DateNav` on `/attendance` pushes a URL search param and
  lets the Server Component refetch — so `/events?month=YYYY-MM` does the same via `MonthNav`,
  keeping the month's data in the initial server render rather than adding a second client-fetch
  path this codebase doesn't otherwise use.
- **UI**: a CSS-grid month calendar (`EventsCalendar`), clicking a day opens `EventDayDialog` —
  a list of that day's events with add/edit/cancel, reusing the same list-then-form dialog shape
  established by `TravelOrderFormDialog`/`AssetIssuanceFormDialog`. Category chips get a small
  deterministic color rotation (5 Tailwind tone pairs, light+dark) purely for at-a-glance
  scanning — display only, never read back.

## Consequences

- No recurring events (a weekly standup repeated every Monday) — v1 doesn't have this either;
  each occurrence is its own `Event` row. Worth a follow-up if requested.
- This closes out every named Phase 8 sub-phase from AGENTS.md §57 (Recruitment, Performance,
  Cases, Assets, Events) except **Documents**, which remains unimplemented.
