import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EventModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { HolidayService } from "@/domains/holidays/holiday-service";
import type { HolidayType } from "@/domains/holidays/holiday-types";
import { dateToDateKey } from "@/lib/date-key";
import { eventHoliday } from "./event-service";
import { holidayCategoryCodes } from "./holiday-category";

export type HolidayEventBackfillOptions = {
  /** false: only list what would change. */
  apply: boolean;
  /** The holiday type to give every event found; required with `apply`. */
  holidayType?: HolidayType;
  /** Only this organization; every organization otherwise. */
  organizationId?: string;
  log?: (line: string) => void;
};

export type HolidayEventBackfillCounts = { found: number; updated: number; added: number; alreadyOnCalendar: number };

/**
 * Holiday-category events saved before ADR-049 have no holiday type, so
 * they never reached the holiday calendar. This gives each one the chosen
 * type and syncs its holiday, exactly as editing the event would. Active
 * events only; idempotent (an event that has a type is never touched again).
 */
export async function backfillHolidayEvents(options: HolidayEventBackfillOptions): Promise<HolidayEventBackfillCounts> {
  if (options.apply && !options.holidayType) throw new Error("Choose the holiday type to give these events");
  const log = options.log ?? (() => undefined);
  await connectMongoDB();

  const missingType = { status: "active", holidayType: null };
  const organizationIds: Types.ObjectId[] = options.organizationId
    ? [new Types.ObjectId(options.organizationId)]
    : await EventModel.distinct("organizationId", missingType);

  const counts: HolidayEventBackfillCounts = { found: 0, updated: 0, added: 0, alreadyOnCalendar: 0 };
  for (const organizationObjectId of organizationIds) {
    const organizationId = organizationObjectId.toString();
    const codes = holidayCategoryCodes(await EventCategoryService.listCurrent(organizationId));
    const events = await EventModel.find({ organizationId: organizationObjectId, ...missingType, category: { $in: [...codes] } }).sort({ date: 1 });

    for (const event of events) {
      counts.found += 1;
      log(`${organizationId}  ${dateToDateKey(event.date)}  ${event.title}`);
      if (!options.apply) continue;

      event.holidayType = options.holidayType;
      await event.save();
      counts.updated += 1;
      await AuditService.record({
        organizationId,
        action: "event.updated",
        resourceType: "Event",
        resourceId: event._id.toString(),
        before: { holidayType: null },
        after: { holidayType: event.holidayType },
        metadata: { backfill: "holiday-events" },
      });

      const holiday = await HolidayService.syncFromEvent(organizationId, event._id.toString(), eventHoliday(event), {});
      if (holiday) counts.added += 1;
      else counts.alreadyOnCalendar += 1;
    }
  }
  return counts;
}
