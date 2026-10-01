# ADR-035: Holiday calendar and day notes (Schedules day panel)

## Status

Accepted

## Context

HR asked to click a date on Attendance › Schedules and see notes about it, for example that the
day is a Philippine holiday. Asked directly, the user chose:

- **An HR-managed holiday calendar**, with a one-click Philippine list, rather than a fixed list in
  code. AGENTS.md §25 names `HolidayCalendar` as a policy, and §2 forbids hardcoding the business.
- The day panel also shows **company events**, the **day's head-count**, and a **free-form HR note**.

## Decision

- **`Holiday`** collection per organization: `date` (UTC midnight of the calendar day, like
  `ScheduleEntry`), `name`, `type` (`regular`, `special_non_working`, `special_working`, following
  Philippine labor-law categories, which also fit most other calendars), optional `scope` (where it
  applies when not nationwide) and `source` (legal basis), `presetKey` when it came from a preset,
  and `status`. Cancelled, never deleted (§53). A same-day, same-name duplicate is refused.
- **Country presets propose, HR decides.** `src/domains/holidays/presets/` holds one module per
  country behind a small `HolidayPreset` interface. The Philippines preset returns a year's list:
  2026 is verified line by line against Proclamation No. 1006, s. 2025 and Proclamation No. 1264,
  s. 2026 (Eid'l Adha, May 27). Other years come from rules (fixed dates under RA 9492 and
  RA 10966, Holy Week from Easter, National Heroes Day as the last Monday of August, known Lunar New
  Year dates) and are marked **unverified** with notes on what to check (Eid holidays, additional
  special days). Nothing is used until HR previews and saves the days they pick.
- **`DayNote`**: one note per organization per day (unique index); empty clears it (`status:
  "cleared"`).
- **Day panel**: clicking a date header opens it (for everyone who can read the schedule). Editors
  get "Add a holiday on this day", the note editor, and "Select everyone on this day", which keeps
  the old column-select shortcut one click away. Company events appear only with `events.read`.
  Head-count is computed from the month view already on the page; no new query.
- **Permissions**: `attendance.read` to see, `attendance.update` to change, so existing roles work
  without reseeding. Dedicated `holidays.*` permissions can be split out when another module
  (payroll) starts relying on the calendar.
- Every change is audited: `holiday.created|updated|cancelled|preset_imported`,
  `day_note.saved|cleared`.

## Consequences

- The calendar is reference data for now. Payroll holiday pay, leave day-counting and attendance
  status don't read it yet; doing so is the natural next step, through their policies.
- New proclamations (Eid'l Fitr each year, a moved holiday, local special days) are added by HR,
  not by a code change. A new verified year in the preset is a small, reviewable data addition.
