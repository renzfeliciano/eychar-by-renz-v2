import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EventModel } from "@/server/db/models";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { HolidayService, type EventHoliday } from "@/domains/holidays/holiday-service";
import type { HolidayType } from "@/domains/holidays/holiday-types";
import { AuditService } from "@/server/audit/audit-service";
import { dateToDateKey } from "@/lib/date-key";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import type { CreateEventInput, UpdateEventInput } from "@/shared/validation/events";
import { isHolidayCategory } from "./holiday-category";

function monthRange(month: string): { from: Date; to: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNum - 1, 1));
  const to = new Date(Date.UTC(year, monthNum, 1));
  return { from, to };
}

/**
 * The holiday type to keep on an event: required for a holiday category
 * (it decides whether the day is off), dropped for any other.
 */
async function holidayTypeFor(organizationId: string, category: string, holidayType: HolidayType | undefined): Promise<HolidayType | undefined> {
  const item = await EventCategoryService.getByCode(organizationId, category);
  if (!isHolidayCategory(item ?? { code: category })) return undefined;
  if (!holidayType) throw new ValidationError("Choose what kind of holiday this is");
  return holidayType;
}

/** What the event puts on the holiday calendar (ADR-049): its day, under its title, while it's an active holiday event. */
export function eventHoliday(event: { date: Date; title: string; holidayType?: string | null; status: string }): EventHoliday {
  if (event.status !== "active" || !event.holidayType) return null;
  return { date: dateToDateKey(event.date), name: event.title, type: event.holidayType as HolidayType };
}

export const EventService = {
  /**
   * Whether a create, edit or cancel would change the holiday calendar
   * (ADR-049): the event is in a holiday category, or is already a holiday
   * event. Routes then also require HOLIDAY_CALENDAR_PERMISSION, so a role
   * that may add events but not holidays can't add one through an event.
   */
  async touchesHolidayCalendar(organizationId: string, change: { eventId?: string; category?: string }): Promise<boolean> {
    await connectMongoDB();
    if (change.category) {
      const item = await EventCategoryService.getByCode(organizationId, change.category);
      if (isHolidayCategory(item ?? { code: change.category })) return true;
    }
    if (!change.eventId || !Types.ObjectId.isValid(change.eventId)) return false;
    const event = await EventModel.findOne({ _id: new Types.ObjectId(change.eventId), organizationId: new Types.ObjectId(organizationId) })
      .select("holidayType")
      .lean<{ holidayType?: string | null }>();
    return Boolean(event?.holidayType);
  },

  async create(input: CreateEventInput, actor: { userId?: string }) {
    await connectMongoDB();
    await EventCategoryService.assertValidCode(input.organizationId, input.category);
    const holidayType = await holidayTypeFor(input.organizationId, input.category, input.holidayType);

    const event = await EventModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      title: input.title,
      date: input.date,
      time: input.time,
      category: input.category,
      description: input.description,
      holidayType,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "event.created",
      resourceType: "Event",
      resourceId: event._id.toString(),
      after: { title: event.title, date: event.date, category: event.category, holidayType: event.holidayType },
    });
    await HolidayService.syncFromEvent(input.organizationId, event._id.toString(), eventHoliday(event), actor);

    return event;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateEventInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();
    await EventCategoryService.assertValidCode(organizationId, patch.category);
    const holidayType = await holidayTypeFor(organizationId, patch.category, patch.holidayType);

    const event = await EventModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!event) throw new NotFoundError("Event not found in this organization");

    const before = { title: event.title, date: event.date, category: event.category, holidayType: event.holidayType };
    event.title = patch.title;
    event.date = patch.date;
    event.time = patch.time;
    event.category = patch.category;
    event.description = patch.description;
    event.holidayType = holidayType;
    await event.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "event.updated",
      resourceType: "Event",
      resourceId: event._id.toString(),
      before,
      after: { title: event.title, date: event.date, category: event.category, holidayType: event.holidayType },
    });
    await HolidayService.syncFromEvent(organizationId, event._id.toString(), eventHoliday(event), actor);

    return event;
  },

  async cancel(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const event = await EventModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!event) throw new NotFoundError("Event not found in this organization");
    if (event.status === "cancelled") throw new BusinessRuleError("This event is already cancelled");

    event.status = "cancelled";
    await event.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "event.cancelled",
      resourceType: "Event",
      resourceId: event._id.toString(),
      before: { status: "active" },
      after: { status: "cancelled" },
    });
    await HolidayService.syncFromEvent(organizationId, event._id.toString(), null, actor);

    return event;
  },

  async listForMonth(organizationId: string, month: string) {
    await connectMongoDB();
    const { from, to } = monthRange(month);
    return EventModel.find({
      organizationId: new Types.ObjectId(organizationId),
      status: "active",
      date: { $gte: from, $lt: to },
    })
      .sort({ date: 1 })
      .lean();
  },
};
