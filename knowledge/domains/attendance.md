# Attendance (records, schedules, policies, self-service clock-in)

**Purpose:** Daily attendance records (HR-recorded and self-service), per-day schedules and shift templates, org and project attendance policies, and geofenced WebAuthn clock-in/out with a live photo.
**Governing docs:** ADR-011 (policy resolution), ADR-020 (self-service WebAuthn), ADR-026 (geofence and liveness), ADR-043 (project scope), ADR-045 (time zone and catalog meaning), ADR-038 (photo storage, referenced in code); ARCHITECTURE.md § Attendance (ADR-011), § Employee self-service attendance (ADR-020); ENGINEERING.md §§ 22, 26, 27, 35.

**Services:**
- `src/domains/attendance/attendance-service.ts`: `AttendanceService`
  - `record(input, actor)`: HR-recorded record for one employee and day; resolves the project as of that day and the policy; `present`/`late` computed once.
  - `adjust(id, orgId, patch, actor)`: edits check-in/out, notes, status; audits before/after.
  - `listForEmployee`, `listForOrganization` (optional date, project, allowed project ids), `dayRoster` (paged daily roster with counts).
  - Exports `computeStatus`, `toCalendarDateUtc`.
- `src/domains/attendance/self-service-attendance-service.ts`: `SelfServiceAttendanceService`: `checkIn`, `checkOut`, `getTodayRecord`. Private `assertWithinSite` (audits blocked attempts).
- `src/domains/attendance/attendance-policy-service.ts`: `AttendancePolicyService`: `create`, `listCurrent`, `updateStatus`, `resolve` (delegates to `src/server/policies/resolve-org-project-policy.ts`).
- `src/domains/attendance/schedule-service.ts`: `ScheduleService`: `getMonthView`, `saveEntries`, `getRoster`, `setRosterMembership`, `getEntryForDate`. Re-exports the date-key helpers.
- `src/domains/attendance/shift-template-service.ts`: `ShiftTemplateService`: `create`, `listCurrent`, `update`, `updateStatus`. Kinds: work, rest, flexi.
- `src/domains/attendance/clock-site-service.ts`: `ClockSiteService`: `listForOrganization`, `resolve`. A clock site is derived on read from Project plus its Location; default radius 100 m.
- `src/domains/attendance/geofence.ts`: `distanceInMeters` (haversine), `evaluateGeofence`, `formatDistance`. Pure, also used by the client.
- `src/domains/attendance/current-staff.ts`: `loadCurrentStaffCheck` (employment statuses flagged `isActiveHeadcount`).
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
- `attendance/export/route.ts`: GET (`attendance.read`).
- `attendance/day-notes/route.ts`: PUT (`attendance.update`); service is holidays.
- `attendance/schedules/route.ts`: PUT (`attendance.update`), `saveEntries`. `schedules/roster/route.ts`: PUT (`attendance.update`). `schedules/export/route.ts`: GET (`attendance.read`).
- `attendance/shifts/route.ts`: GET (`attendance.read`), POST (`attendance.update`). `shifts/[id]/route.ts`: PATCH (`attendance.update`).
- `attendance-policies/route.ts`: GET, POST (`attendance-policies.read` / `.create`). `[id]/route.ts`: PATCH (`attendance-policies.update`).
- `self-service/attendance/route.ts`: GET. `clock-in/route.ts`: POST. `clock-out/route.ts`: POST. All use `requireSelfServiceEmployee`.

**Pages:**
- `src/app/(app)/attendance/page.tsx`: daily roster (org-wide `attendance.read` check, line 52), with `record-dialog.tsx`, `export-attendance-dialog.tsx`, `date-nav.tsx`.
- `src/app/(app)/attendance/policies/page.tsx` with `create-policy-dialog.tsx`.
- `src/app/(app)/attendance/schedules/page.tsx`: month grid, roster, shift templates, holidays dialogs.
- `src/app/(self-service)/clock/page.tsx`: the clock screen. Reads today's schedule entry with `localDateKey()` (line 24).

**Tests:**
- `tests/domains/attendance/`: `attendance-service`, `attendance-policy-service`, `self-service-attendance-service`, `self-service-attendance-photos`, `clock-site-service`, `clock-progress`, `geofence`, `shift-template-service`, `schedule-service`, `schedule-export`, `attendance-export`, `attendance-report`, `shift-display`, `cross-organization-integrity`.
- `tests/app/date-nav.test.tsx`, `tests/app/export-attendance-dialog.test.tsx`.
- No test imports `current-staff.ts` directly; `day-headcount.ts` appears in one test file.

**Rules a change must respect:**
- One record per employee per calendar day. The date is the UTC calendar day from `toCalendarDateUtc` (`attendance-service.ts` lines 39-41), enforced by the unique index (`attendance-record.ts` line 78).
- `present`/`late` is computed once, at record time, against the policy resolved for that record's date and project. It is never recomputed (`attendance-service.ts` `computeStatus`, lines 49-53, and `record`, line 95; `self-service-attendance-service.ts` line 116). Late is compared in the app's zone (`minutesOfDayInAppZone`, `attendance-service.ts` lines 21-23). Do not compare policy times with UTC hours; the comment at lines 16-20 explains why.
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
- Audited actions: `attendance.recorded`, `attendance.adjusted`, `attendance.self_check_in`, `attendance.self_check_out`, `attendance-policy.created` / `.updated`, `shift-template.created` / `.updated`, `schedule.updated`, `schedule.roster-updated`.

**Known gaps / mismatches:**
- **"Today" is a UTC date in attendance writes and reads, not the Manila date.** `self-service-attendance-service.ts` uses `toCalendarDateUtc(now)` for clock-in (line 111), clock-out (line 161) and `getTodayRecord` (line 212). `attendance/page.tsx` line 56 defaults to `new Date()`, and `dashboard/page.tsx` line 169 passes `{ date: now }`. Both then reduce to the UTC day. But the dashboard's `todayKey` (`dashboard/page.tsx` line 100) and the clock page's schedule lookup use `localDateKey()` (Manila). ADR-045 (lines 12-19) says calendar dates go through the app-time helpers. Result: a clock-in between 00:00 and 08:00 Manila is filed under the previous day, while the schedule and the dashboard use the Manila day. Not run; confirm with a test.
- **Project scope is partial.** Only `GET /api/attendance` honours project scope. The attendance page (`page.tsx` line 52), `POST /api/attendance`, `PATCH /api/attendance/[id]`, the schedules and shifts routes, and both exports are organization-wide. A project-scoped `attendance.read` holder is refused the page even though the API would list their project's records. ARCHITECTURE.md and ADR-043 list attendance as project-scoped.
- **Two notions of "current project" in one roster.** `dayRoster` takes the latest assignment regardless of date (`attendance-service.ts` lines 266-280), while `listForOrganization` uses `assignmentsAsOf(record date)` (line 208).
- **`adjust()` does not recompute status** when check-in changes (lines 157-160). Status is intentionally stored, so a corrected check-in can leave a stale late/present flag unless the caller also sends `status`.
- **Inline photos.** Without a Blob store, the clock photo is stored inline in the record (`self-service-attendance-service.ts` lines 37-38), contrary to the private-blob intent of ADR-038 (cited in code at `attendance-service.ts` line 28). Confirm the production configuration.
- **Exports are not audited** (see audit file).
- Shift templates have no permission keys of their own. `api/attendance/shifts/route.ts` creates them under `attendance.update`, and the seed (`scripts/seed.ts`) defines no shift keys. Confirm this is intended.
- Holidays do not drive attendance or pay (ARCHITECTURE.md Known gaps); holidays reuse `attendance.*`.

**Last verified:** 6587050.
