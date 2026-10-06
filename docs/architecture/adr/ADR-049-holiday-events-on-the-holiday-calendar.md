# ADR-049: Holiday events go on the holiday calendar

## Status

Accepted. Extends ADR-024 (Events) and ADR-035 (Holiday calendar).

## Context

HR asked that an event they add on the company calendar under the Holiday category also show as a
holiday on Attendance › Schedules. Before this, the two were separate: an event in the "holiday"
category was only a dot on `/events`, and the schedule's holiday markers, day panel and Holidays
dialog read only the `Holiday` collection.

## Decision

- **Which categories count is catalog data.** `EventCategory.metadata.isHoliday` (ADR-045 pattern,
  `src/domains/events/holiday-category.ts`). The seed sets it on the default "holiday" item and
  backfills existing organizations; the seeded `holiday` code keeps that meaning for items saved
  without the flag, through `catalogFlag`'s legacy fallback.
- **An event in such a category needs a holiday type** (`Event.holidayType`, same values as
  `HOLIDAY_TYPES`), since the type decides whether the day is off. The event form shows the field
  only for holiday categories; the service refuses a holiday event without it and drops it for any
  other category.
- **The event owns a mirrored `Holiday`** linked by `Holiday.eventId`.
  `HolidayService.syncFromEvent` runs after every event create, update and cancel: it adds the
  holiday, moves, renames or retypes it with the event, and cancels it when the event is cancelled
  or moved to a non-holiday category. If the calendar already has an active holiday on that day
  under the same name (for example from the Philippine preset), nothing is added and the event's
  own copy, if any, is cancelled. That way the day never shows twice.
- **Changed only through the event.** `HolidayService.update` and `cancel` refuse a holiday with an
  `eventId`, so the two can't drift apart. The Schedules day panel and Holidays dialog show such a
  holiday as "From the company calendar" with a link to the event's month instead of edit or
  remove buttons.
- **Not listed twice.** The Schedules day panel and the dashboard's "Coming up" leave out an event
  that already appears as its linked holiday.
- **Holiday events also need the holiday-calendar permission.** On top of `events.create` /
  `events.update`, a change that touches the holiday calendar needs `HOLIDAY_CALENDAR_PERMISSION`
  (`attendance.update`, the same one the Schedules holiday routes use, ADR-035). That covers
  creating an event in a holiday category, editing a holiday event or turning an event into one or
  out of one, and cancelling a holiday event. `EventService.touchesHolidayCalendar` decides; the
  event routes then call `authorize`. So a role can be allowed to add events but not holidays. The
  events page hides holiday categories in the form, and edit and cancel on holiday events, from
  people without it. HR Administrator holds both, so nothing changes for HR. Holiday changes are
  audited as `holiday.created|updated|cancelled` with the `eventId` in `after`.
- **Index** `{ organizationId, eventId }`, partial on `eventId` existing, for the per-event lookup
  in `syncFromEvent`.

## Consequences

- Holiday-category events created before this change have no holiday type and no linked holiday.
  `scripts/backfill-holiday-events.ts` lists them (dry run). With `--apply --type <type>` it gives
  each one that type and syncs its holiday, as an edit would (`backfillHolidayEvents`, audited as
  `event.updated` with `metadata.backfill`). One type for all of them; a different one is set
  afterwards by editing that event. Editing one by hand also works.
- The event save and the holiday sync aren't in one transaction. The event is validated (category
  and holiday type) before anything is written, and the sync only fails on a database error. After
  such a failure, saving the event again repairs the holiday.
- The holiday-calendar permission is still `attendance.update`. Splitting out `holidays.*`
  permissions (ADR-035's follow-up) means changing `HOLIDAY_CALENDAR_PERMISSION` and the Schedules
  holiday routes together.
