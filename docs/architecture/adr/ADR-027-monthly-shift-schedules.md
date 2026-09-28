# ADR-027: Monthly shift schedules (Attendance → Schedules)

## Status

Accepted

## Context

HR asked for a submodule under Attendance to map each employee's monthly schedule, with an easy
export. Asked directly, the user chose:

- **Shift templates**: HR defines reusable shifts once and picks one per day (not free-typed times).
- **Reference only**: the schedule is a plan. Late/present keeps following `AttendancePolicy`
  (ADR-011); the schedule does not override it.
- **A project per day**: each scheduled work day can name the project/site, for people who rotate
  between sites.
- **Export**: an Excel month grid **and** a CSV.

## Decision

- **`ShiftTemplate`** (`organizationId`, `name`, `code` ≤6 chars, unique per org, `kind: work|rest`,
  `startTime`/`endTime` as `HH:mm`, `status`). A work shift needs both times and a real span; an end
  before its start is an overnight shift. A rest day has no times. Deactivated, never deleted.
  Managed in a "Shifts" dialog on the Schedules page.
- **`ScheduleEntry`**: one per (organization, employee, calendar day) (unique index), with
  `shiftTemplateId`, an embedded **`shift` snapshot** (code/name/kind/times) and an optional
  `projectId` (never set on rest days). The snapshot means editing a template never rewrites an
  already planned or exported month. `date` is UTC midnight of the organization's local calendar day
  (`localDateKey()` reads the server's local date, not the UTC date).
- **`ScheduleService.saveEntries`** upserts or clears (`shiftTemplateId: null`) a whole selection in
  one `bulkWrite`, after validating every employee, shift and project belongs to the organization
  (and that shifts/projects are active). One bad id rejects the whole batch before any write. Each
  affected employee gets one `schedule.updated` audit entry listing the changed days.
- **Who appears**: employees whose employment status counts toward active headcount (the dashboard's
  rule, `metadata.isActiveHeadcount`), plus anyone already scheduled that month, so a past month stays
  complete after someone leaves.
- **Authorization**: reuses `attendance.read` (view and export) and `attendance.update` (plan
  schedules and manage shifts) instead of new permission keys, so no re-seed or role change is needed
  on existing databases.
- **Export**: `GET /api/attendance/schedules/export?organizationId&month&format=xlsx|csv`, built
  server-side. The `.xlsx` (via `exceljs`) has a "Schedule" sheet (title, employees × days, weekday
  row, shift codes, rest days shaded, headers frozen, shift legend, landscape fit-to-width for
  printing) and a filterable "Details" sheet. The CSV is the same long format (one row per scheduled
  day, UTF-8 BOM for Excel).
- **UI** (`/attendance/schedules`): a month grid with a sticky name column and a name/number search.
  Selection works like a spreadsheet:
  - Click a cell to toggle it.
  - Drag with a mouse to select a block, across employees too. Starting a drag on an already
    selected day erases instead.
  - Shift-click extends a block from the last cell.
  - Click a name or date to toggle a whole row or column.
  - Touch keeps its native sideways scroll, so taps and the row/column headers cover selection there.

  The how-to hint stays on screen the whole time. A floating action bar follows the selection:
  - One button per active shift applies it in one click. Work days keep the project they already
    had, if it's still active.
  - "With project…" picks the shift and project together.
  - "Clear" (confirmed) unschedules the selected days.

  Each name shows that month's work-day count. The grid is read-only without `attendance.update`.
  It scrolls sideways inside its own frame; the page never does.
- **Clock-in**: the self-service clock screen now pre-selects today's scheduled project (falling back
  to the assignment's project) when it's a clock-in site. The employee can still choose another.

## Consequences

- Because the schedule is reference-only, an employee can clock in on a rest day or at a different
  site than planned; nothing blocks or flags it yet. Comparing actual attendance against the plan
  (e.g. "scheduled but absent", "worked on a rest day") is a natural follow-up.
- `exceljs` brings a transitive `uuid` advisory (moderate; buffer bounds in v3/v5/v6 when a buffer
  is passed). The export only writes workbooks and never calls those functions.
- The whole selection is saved in one request, capped at 6,200 employee-days (31 days × 200 people).
