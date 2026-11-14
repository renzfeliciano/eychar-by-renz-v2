# Events (company calendar)

**Purpose:** The company calendar: dated events by month, cancelled rather than deleted. An event in a holiday category also puts a mirrored day on the holiday calendar.
**Governing docs:** ADR-024 (Accepted, `docs/architecture/adr/ADR-024-events-calendar.md`); ADR-049 (Accepted, holiday events on the holiday calendar); ADR-016 (generic catalogs, source of `EventCategory`); ADR-045 (catalog flags as configuration); ARCHITECTURE.md § Events (Phase 8, ADR-024); ENGINEERING.md §57 (Phase 8 lists Events).
**Services:**
- `src/domains/events/event-service.ts`: `EventService` with `touchesHolidayCalendar(org, change)`, `create(input, actor)`, `update(id, org, patch, actor)`, `cancel(id, org, actor)`, `listForMonth(org, "YYYY-MM")`. Also exports `eventHoliday(event)`, which maps an event to the holiday it should produce.
- `src/domains/events/holiday-category.ts`: `isHolidayCategory`, `holidayCategoryCodes`, `LEGACY_HOLIDAY_CATEGORY_CODES` (`{"holiday"}`). Reads the `isHoliday` flag through `catalogFlag` from `src/domains/catalog/catalog-flags.ts`.
- `src/domains/events/calendar.ts`: pure helpers `shiftMonth`, `buildMonthGrid` (Sunday-first, whole weeks), `groupByDate`.
- `src/domains/events/holiday-event-backfill.ts`: `backfillHolidayEvents({apply, holidayType, organizationId?})`. Gives older holiday-category events a holiday type and syncs their holiday. Idempotent. Run by `scripts/backfill-holiday-events.ts` (per ARCHITECTURE.md § Events and `knowledge/overview.md`).
- Calls `EventCategoryService` (`src/domains/catalog/event-category-service.ts`) and `HolidayService.syncFromEvent` (`src/domains/holidays/holiday-service.ts`).

**Models:**
- `src/server/db/models/event.ts` (`Event`): `title`, `date`, `time?`, `category`, `description?`, `holidayType?` (`regular | special_non_working | special_working`), `status` (`active`, `cancelled`). Index `{organizationId, date}`.
- `src/server/db/models/event-category.ts` (catalog item; `metadata.isHoliday` flag).
- `src/server/db/models/holiday.ts`: the mirrored row, linked by `eventId` (see the holidays file).

**Routes:**
- `src/app/api/events/route.ts`: `GET` (`events.read`, `?month=`), `POST` (`events.create`). Adds `attendance.update` when `touchesHolidayCalendar`.
- `src/app/api/events/[id]/route.ts`: `PATCH` (`events.update`), `DELETE` = cancel (`events.update`). Both add `attendance.update` for holiday events.

**Pages:**
- `src/app/(app)/events/page.tsx`, `events-calendar.tsx`, `event-day-dialog.tsx`, `loading.tsx`.

**Tests:**
- `tests/domains/events/event-service.test.ts` (6), `calendar.test.ts` (4), `event-holiday-sync.test.ts` (9), `holiday-event-backfill.test.ts` (3)
- `tests/app/events-calendar.test.tsx`
- `tests/server/authorization/holiday-event-permission.test.ts` (route-level check for `attendance.update`)

**Rules a change must respect:**
- Events are never hard-deleted by this service. `cancel` sets `status: "cancelled"` and `listForMonth` returns only `active` events (`event-service.ts`).
- A holiday-category event must have a `holidayType`. A non-holiday event drops it (`holidayTypeFor`, `event-service.ts`).
- Whether a category is a holiday is catalog data (`metadata.isHoliday`), not a hard-coded code. The legacy `"holiday"` code is the fallback (`holiday-category.ts`).
- A change that touches the holiday calendar (holiday category, or an event already holding a `holidayType`) also needs `attendance.update`. The route checks this before the service runs (`events/route.ts`, `events/[id]/route.ts`). The check looks at the stored event and the incoming category.
- After create, update or cancel, `HolidayService.syncFromEvent` is called with `eventHoliday(event)`. A `null` argument takes the mirrored holiday off (`event-service.ts`).
- `listForMonth` uses a UTC month range (`monthRange`).

**Known gaps / mismatches:**
- The event save and the holiday sync are not in one transaction. ADR-049 Consequences (line ~55) records this as accepted. A failure between the two writes leaves them out of step until the event is edited again.
- Events can also go to the recycle bin (`event` is a leaf in `src/domains/deletion/deletion-registry.ts`). ARCHITECTURE.md § Events says there is no hard delete and does not mention the bin.
- `touchesHolidayCalendar` falls back to `isHolidayCategory({ code })` when the category is not in the catalog. That fallback is true only for the legacy `"holiday"` code. Create and update refuse unknown codes earlier through `EventCategoryService.assertValidCode`, so the fallback matters only for the pre-check in the route.

**Last verified:** 6587050
