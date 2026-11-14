# Holiday calendar and day notes

**Purpose:** HR's organization holiday calendar: dated holidays with an observance type, a free-form note per day, and country presets (Philippines) that propose a year's holidays for HR to review. Active holidays set the attendance day type and so drive premium pay (ADR-056, ADR-057), mapped through the payroll policy's `holidayDayTypes`.
**Governing docs:** ADR-035 (Accepted, `docs/architecture/adr/ADR-035-holiday-calendar-and-day-notes.md`); ADR-049 (Accepted, holiday events mirror onto this calendar); ARCHITECTURE.md § Holiday calendar & day notes (ADR-035) and § Known gaps ("Holidays don't drive pay or attendance yet", "Eid'l Fitr … aren't built in"); ENGINEERING.md §25 (policy architecture, which lists `HolidayCalendar`).
**Services:**
- `src/domains/holidays/holiday-service.ts`: `HolidayService` with `listBetween(org, from, to)`, `listForYear`, `create`, `update`, `cancel`, `syncFromEvent(org, eventId, wanted, actor)`, `previewPreset(org, key, year)`, `importPreset(input, actor)`. Also exports `toHolidayView` and the types `EventHoliday` and `PresetPreview`.
- `src/domains/holidays/day-note-service.ts`: `DayNoteService` with `listBetween` and `save` (empty note clears it).
- `src/domains/holidays/day-info.ts`: `buildDayInfo(holidays, events, notes)` groups a month's holidays, events and notes by day for the Schedules day panel.
- `src/domains/holidays/holiday-types.ts`: `HOLIDAY_TYPES`, `HOLIDAY_TYPE_LABELS`, `isDayOff(type)` (true except `special_working`), `HOLIDAY_CALENDAR_PERMISSION = "attendance.update"`, `HolidayView`.
- `src/domains/holidays/presets/`: `index.ts` (`HOLIDAY_PRESETS`, `holidayPreset(key)`), `types.ts` (`HolidayPreset`, `PresetYear` with `verified` and `notes`), `philippines.ts` (`philippinesPreset`, key `PH`).

**Models:**
- `src/server/db/models/holiday.ts` (`Holiday`): `date` (UTC midnight), `name`, `type`, optional `scope`, `source`, `presetKey`, `eventId`, `status` (`active`, `cancelled`). Indexes `{organizationId, date}` and a partial index `{organizationId, eventId}`. No unique index on name or date.
- `src/server/db/models/day-note.ts` (`DayNote`): `note`, `status` (`active`, `cleared`), `updatedByUserId`. Unique index `{organizationId, date}`.

**Routes:**
- `src/app/api/holidays/route.ts`: `GET` (`attendance.read`, by year), `POST` (`attendance.update`).
- `src/app/api/holidays/[id]/route.ts`: `PATCH` and `DELETE` (cancel), both `attendance.update`.
- `src/app/api/holidays/presets/route.ts`: `GET` preview (`attendance.update`), `POST` import (`attendance.update`, 201).
- `src/app/api/attendance/day-notes/route.ts`: day-note save through `DayNoteService`.

**Pages:**
- `src/app/(app)/attendance/schedules/holidays-dialog.tsx`, `add-holiday-form.tsx`, `holiday-badge.tsx`. The Schedules page (`attendance/schedules/page.tsx`) and `day-details-dialog.tsx` (uses `isDayOff`, line ~66).
- `src/app/(app)/dashboard/page.tsx` also calls `HolidayService`.

**Tests:**
- `tests/domains/holidays/holiday-service.test.ts` (6)
- `tests/domains/holidays/philippines-preset.test.ts` (5)
- `tests/app/holidays-dialog.test.tsx`
- `tests/server/authorization/holiday-event-permission.test.ts` (permission for event-linked holidays)
- No tests cover `DayNoteService` or `day-info.ts` in `tests/domains/holidays/`.

**Rules a change must respect:**
- A holiday with an `eventId` belongs to a company-calendar event. `update` and `cancel` refuse it (`assertNotFromEvent`). Change it through the event (ADR-049).
- A holiday is never deleted. `cancel` sets `status: "cancelled"` (`holiday-service.ts`). A second cancel is refused.
- Same name on the same day is refused as `ConflictError` (`assertNotDuplicate`). Name comparison ignores case and surrounding spaces.
- `syncFromEvent` takes the event's mirror off, rather than adding a second copy, when the day already has a holiday with the same name (`takeOff`).
- Presets only propose. `importPreset` refuses any date not in the preview (`ValidationError`), and skips days already on the calendar (`alreadyAdded`).
- The Philippines preset is verified line by line for 2026 only (`VERIFIED` in `philippines.ts`). Other years are built by rule (fixed dates, Holy Week from Easter, last Monday of August) and marked `verified: false`. The UI must say which.
- A holiday type expresses observance only. Pay treatment belongs in payroll policy (comment in `holiday-types.ts`).
- Dates are stored as UTC midnight through `dateKeyToDate` and read back with `dateToDateKey` (`src/lib/date-key.ts`).
- Every holiday, day-note and preset change is audited (`holiday.created|updated|cancelled|preset_imported`, `day_note.saved|cleared`).
- Permission changes are one constant (`HOLIDAY_CALENDAR_PERMISSION`). Routes that hard-code `"attendance.update"` must match it.

**Known gaps / mismatches:**
- Holidays reuse `attendance.read` and `attendance.update` (ARCHITECTURE.md § Known gaps; `HOLIDAY_CALENDAR_PERMISSION`).
- A scoped holiday applies only where the employee's project location name or code equals the scope (case-insensitive); a different spelling is silently not applied (`day-holiday.ts`, `pickHoliday`).
- Adding, moving or cancelling a holiday for days already recorded needs an attendance recalculate; nothing re-measures on its own.
- ARCHITECTURE.md § Holiday calendar cites ENGINEERING.md §25 for `HolidayCalendar`. §25 (Policy Architecture) names `HolidayCalendar` as an example policy. The "HolidayCalendar ENGINEERING.md §25 asks for" wording overstates it. Low severity.
- Eid'l Fitr and Eid'l Adha are not built in. Preset notes say so (`philippines.ts`, `notes`). Chinese New Year is known only through 2030 (`CHINESE_NEW_YEAR`).
- The duplicate-name check is application-level only. `holiday.ts` has no unique index, and `importPreset` uses `insertMany` without a transaction. Two concurrent imports can add the same day twice.
- `isDayOff` is used only in the Schedules UI; attendance and payroll decide day-off from the mapped day type (`isDayOffDayType` in `holiday-day-types.ts`).

**Last verified:** 83ab0ba
