# Attendance (records, schedules, policies, self-service clock-in)

**Purpose:** Daily attendance records (HR-recorded and self-service), per-day schedules and shift templates, org and project attendance policies, and geofenced WebAuthn clock-in/out with a live photo.
**Governing docs:** ADR-011 (policy resolution), ADR-020 (self-service WebAuthn), ADR-026 (geofence and liveness), ADR-043 (project scope), ADR-045 (time zone and catalog meaning), ADR-038 (photo storage, referenced in code), ADR-056 (stored day result), ADR-057 (computed pay premiums); ARCHITECTURE.md § Attendance (ADR-011), § Employee self-service attendance (ADR-020); ENGINEERING.md §§ 22, 26, 27, 35.

**Services:**
- `src/domains/attendance/attendance-service.ts`: `AttendanceService`
  - `record(input, actor)`: HR-recorded record for one employee and day; resolves the project as of that day and the policy; `present`/`late` computed once.
  - `adjust(id, orgId, patch, actor)`: edits check-in/out, notes, status, `overtimeApproved`; recomputes a computed present/late status when the check-in changes and no status is sent; re-measures the day result when check-in, check-out or approval changes; audits before/after.
  - Exports `appCalendarDate(instant)`: the organization's (Manila) calendar day for an instant. Use it for "today" and for clock times; `toCalendarDateUtc` only for values that already are calendar dates.
  - `listForEmployee`, `listForOrganization` (optional date, project, allowed project ids), `dayRoster` (paged daily roster with counts).
  - Exports `computeStatus`, `toCalendarDateUtc`.
- `src/domains/attendance/self-service-attendance-service.ts`: `SelfServiceAttendanceService`: `checkIn`, `checkOut`, `getTodayRecord`. Private `assertWithinSite` (audits blocked attempts).
- `src/domains/attendance/attendance-policy-service.ts`: `AttendancePolicyService`: `create`, `listCurrent`, `updateStatus`, `resolve` (delegates to `src/server/policies/resolve-org-project-policy.ts`).
- `src/domains/attendance/schedule-service.ts`: `ScheduleService`: `getMonthView`, `saveEntries`, `getRoster`, `setRosterMembership`, `getEntryForDate`. Re-exports the date-key helpers.
- `src/domains/attendance/shift-template-service.ts`: `ShiftTemplateService`: `create`, `listCurrent`, `update`, `updateStatus`. Kinds: work, rest, flexi.
- `src/domains/attendance/clock-site-service.ts`: `ClockSiteService`: `listForOrganization`, `resolve`. A clock site is derived on read from Project plus its Location; default radius 100 m.
- `src/domains/attendance/geofence.ts`: `distanceInMeters` (haversine), `evaluateGeofence`, `formatDistance`. Pure, also used by the client.
- `src/domains/attendance/current-staff.ts`: `loadCurrentStaffCheck` (employment statuses flagged `isActiveHeadcount`).
- Day result (ADR-056): `day-calc.ts` (`calculateDay`, pure; `DAY_CALC_VERSION`, `ATTENDANCE_TIME_RULE_DEFAULTS`, `timeRulesOf`), `day-result.ts` (`buildDayResult`, `DayResultService.recalculate`, `MAX_RECALCULATE_DAYS` 62), `day-holiday.ts` (`holidayForDay`, `pickHoliday`, `placeNamesOf`, `previousWorkdayStatus`), `day-result-labels.ts` (`dayTypeLabel`, `formatMinutesShort`).
- Backfills: `attendance-date-backfill.ts` (`backfillAttendanceDates`, moves UTC-dated records onto the Manila day; `scripts/backfill-attendance-dates.ts`) and `day-result-backfill.ts` (`backfillDayResults`; `scripts/backfill-day-results.ts`). Both dry-run by default; run the dates one first.
- Read-only helpers: `day-headcount.ts` (`dayHeadcount`), `clock-progress.ts`, `shift-colors.ts`, `shift-display.ts`.
- Reports and exports: `attendance-report.ts` (`AttendanceReportService`), `attendance-export.ts` (`buildAttendanceCsv`, `buildAttendanceWorkbook`), `schedule-export.ts` (`buildScheduleCsv`, `buildScheduleWorkbook`).
- Adjacent: `src/server/storage/attendance-photo-storage.ts` (`AttendancePhotoStorage`); `WebAuthnService` in `src/domains/identity/webauthn-service.ts`.

**Models** (`src/server/db/models/`):
- `attendance-record.ts` (`AttendanceRecord`; unique `{ organizationId, employeeId, date }`, line 78).
- `attendance-policy.ts` (`AttendancePolicy`), `attendance-status.ts` (catalog).
- `schedule-entry.ts` (`ScheduleEntry`; unique `{ organizationId, employeeId, date }`, line 41).
- `shift-template.ts` (`ShiftTemplate`).
- `location.ts` (coordinates, `geofenceRadiusMeters`), `project.ts` (`locationId`, `status`).
- `employee.ts` (`excludedFromSchedule`), `employee-assignment.ts`, `employment.ts`.
- `day-note.ts` belongs to the holidays domain; the day-notes route is shared.

**Routes** (`src/app/api/`):
- `attendance/route.ts`: GET (`attendance.read`; the only attendance route that honours project scope, lines 21-30), POST (`attendance.create`).
- `attendance/[id]/route.ts`: PATCH (`attendance.update`).
- `attendance/export/route.ts`: GET (`attendance.read`). Includes day type, late, undertime, overtime, overtime approved and night columns from the stored result.
- `attendance/recalculate/route.ts`: POST (`attendance.recalculate`), `DayResultService.recalculate`.
- `attendance/day-notes/route.ts`: PUT (`attendance.update`); service is holidays.
- `attendance/schedules/route.ts`: PUT (`attendance.update`), `saveEntries`. `schedules/roster/route.ts`: PUT (`attendance.update`). `schedules/export/route.ts`: GET (`attendance.read`).
- `attendance/shifts/route.ts`: GET (`attendance.read`), POST (`attendance.update`). `shifts/[id]/route.ts`: PATCH (`attendance.update`).
- `attendance-policies/route.ts`: GET, POST (`attendance-policies.read` / `.create`). `[id]/route.ts`: PATCH (`attendance-policies.update`).
- `self-service/attendance/route.ts`: GET. `clock-in/route.ts`: POST. `clock-out/route.ts`: POST. All use `requireSelfServiceEmployee`.

**Pages:**
- `src/app/(app)/attendance/page.tsx`: daily roster (org-wide `attendance.read` check), with an Hours column from the stored result, `record-dialog.tsx` (measured day, overtime approval for `attendance.update`), `recalculate-dialog.tsx` (`attendance.recalculate`), `export-attendance-dialog.tsx`, `date-nav.tsx`.
- `src/app/(app)/attendance/policies/page.tsx` with `create-policy-dialog.tsx`.
- `src/app/(app)/attendance/schedules/page.tsx`: month grid, roster, shift templates, holidays dialogs.
- `src/app/(self-service)/clock/page.tsx`: the clock screen. Reads today's schedule entry with `localDateKey()` (line 24).

**Tests:**
- `tests/domains/attendance/`: `attendance-service`, `attendance-policy-service`, `self-service-attendance-service`, `self-service-attendance-photos`, `clock-site-service`, `clock-progress`, `geofence`, `shift-template-service`, `schedule-service`, `schedule-export`, `attendance-export`, `attendance-report`, `shift-display`, `cross-organization-integrity`.
- Day result: `day-calc`, `day-result`, `day-result-holidays`, `attendance-date-backfill` in `tests/domains/attendance/`; `tests/app/api/attendance-recalculate-route.test.ts`.
- `tests/app/date-nav.test.tsx`, `tests/app/export-attendance-dialog.test.tsx`, `tests/app/attendance-record-dialog.test.tsx`, `tests/app/create-attendance-policy-dialog.test.tsx`, `tests/app/shift-templates-dialog.test.tsx`.
- No test imports `current-staff.ts` directly; `day-headcount.ts` appears in one test file.

**Rules a change must respect:**
- One record per employee per calendar day, enforced by the unique index. The day is the organization's (Manila) calendar day: `appCalendarDate(instant)` for clock times and "today", stored as UTC midnight of that day.
- `present`/`late` is computed once, at record time, against the policy resolved for that record's date and project. It is never recomputed (`attendance-service.ts` `computeStatus`, lines 49-53, and `record`, line 95; `self-service-attendance-service.ts` line 116). Late is compared in the app's zone (`minutesOfDayInAppZone`, `attendance-service.ts` lines 21-23). Do not compare policy times with UTC hours; the comment at lines 16-20 explains why.
- The stored day result (ADR-056) is computed at record, clock-in, clock-out and on adjust of times or approval, never on read. Expected hours come from the scheduled shift, else the policy. No rates, windows or thresholds in code: break, rounding and night window are policy data. Bump `DAY_CALC_VERSION` whenever `calculateDay`'s rules change. Changing schedules, holidays or policies for recorded days needs an explicit recalculate (audited `attendance.recalculated`).
- Holidays reach the day type only through the payroll policy's `holidayDayTypes` (`src/domains/payroll/holiday-day-types.ts`), never a hardcoded switch. Only active holidays; a scoped one only where the project location name or code matches.
- Payroll pays only approved overtime (`overtimeApproved`, set through adjust).
- Always pass the effective date to `AttendancePolicyService.resolve` (`attendance-service.ts` lines 88-93; `attendance-policy-service.ts` lines 83-86).
- Self-service identity comes from the session via `requireSelfServiceEmployee`. WebAuthn is verified first (`self-service-attendance-service.ts` lines 104 and 158). The geofence is checked before any photo is stored, so a blocked attempt leaves no photo (lines 108-121).
- Blocked attempts are audited as `attendance.self_check_in_blocked` / `attendance.self_check_out_blocked` against the Employee (lines 53-83).
- Clock-in uses the site actually worked (`data.projectId`), not the assignment's home project (lines 106-115). Clock-out uses the clock-in's project and may use an inactive project (lines 171-175; `clock-site-service.ts` line 74).
- Clock-out is guarded against double writes: `updateOne({ _id, checkOutAt: null })` (lines 185-196).
- The client-side geofence check is a convenience only; the server re-runs it (`geofence.ts` header comment).
- A site needs coordinates (`clock-site-service.ts` lines 88-90). Radius falls back to 100 m (line 43).
- Schedule entries: rest days never carry a project; a null shift deletes the entry; custom hours only on work shifts (`schedule-service.ts` `saveEntries`, lines 207-209 and around 220-240).
- Shift template kinds have their own required fields (`shift-template-service.ts` lines 20-38).
- Status codes must be active catalog codes once the attendance-status catalog has items (`attendance-service.ts` lines 96 and 152; see catalog file).
- Audited actions: `attendance.recorded`, `attendance.adjusted`, `attendance.recalculated`, `attendance.date_corrected`, `attendance.self_check_in`, `attendance.self_check_out`, `attendance-policy.created` / `.updated`, `shift-template.created` / `.updated`, `schedule.updated`, `schedule.roster-updated`.

**Known gaps / mismatches:**
- **Resolved (attendance plan Phase 1): "today" was a UTC date.** Was: `self-service-attendance-service.ts` uses `toCalendarDateUtc(now)` for clock-in (line 111), clock-out (line 161) and `getTodayRecord` (line 212). `attendance/page.tsx` line 56 defaults to `new Date()`, and `dashboard/page.tsx` line 169 passes `{ date: now }`. Both then reduce to the UTC day. But the dashboard's `todayKey` (`dashboard/page.tsx` line 100) and the clock page's schedule lookup use `localDateKey()` (Manila). ADR-045 (lines 12-19) says calendar dates go through the app-time helpers. Result: a clock-in between 00:00 and 08:00 Manila is filed under the previous day, while the schedule and the dashboard use the Manila day. Not run; confirm with a test.
- **Project scope is partial.** Only `GET /api/attendance` honours project scope. The attendance page (`page.tsx` line 52), `POST /api/attendance`, `PATCH /api/attendance/[id]`, the schedules and shifts routes, and both exports are organization-wide. A project-scoped `attendance.read` holder is refused the page even though the API would list their project's records. ARCHITECTURE.md and ADR-043 list attendance as project-scoped.
- **Resolved (Phase 1): two notions of "current project" in one roster.** Was: `dayRoster` takes the latest assignment regardless of date (`attendance-service.ts` lines 266-280), while `listForOrganization` uses `assignmentsAsOf(record date)` (line 208).
- **Resolved (Phase 1): `adjust()` did not recompute status** when check-in changed. It now does for a computed present/late status when no status is sent.
- **Two notions of "late" on shift days.** The present/late status follows the attendance policy's start time; `dayResult.lateMinutes` follows the scheduled shift (owner decision at GATE 2, ADR-056).
- **Records from before the day result** have none until `scripts/backfill-day-results.ts` runs; payroll warns `day_result_missing` for timed ones.
- **Inline photos.** Without a Blob store, the clock photo is stored inline in the record (`self-service-attendance-service.ts` lines 37-38), contrary to the private-blob intent of ADR-038 (cited in code at `attendance-service.ts` line 28). Confirm the production configuration.
- **Exports are not audited** (see audit file).
- Shift templates have no permission keys of their own. `api/attendance/shifts/route.ts` creates them under `attendance.update`, and the seed (`scripts/seed.ts`) defines no shift keys. Confirm this is intended.
- Holidays reuse `attendance.*` permissions. Two regular holidays on one day count once (no double-holiday pay).

**Last verified:** 83ab0ba (attendance engine plan, Phases 1-6).
