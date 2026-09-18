import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EventModel } from "@/server/db/models";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateEventInput, UpdateEventInput } from "@/shared/validation/events";

function monthRange(month: string): { from: Date; to: Date } {
  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNum - 1, 1));
  const to = new Date(Date.UTC(year, monthNum, 1));
  return { from, to };
}

export const EventService = {
  async create(input: CreateEventInput, actor: { userId?: string }) {
    await connectMongoDB();
    await EventCategoryService.assertValidCode(input.organizationId, input.category);

    const event = await EventModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      title: input.title,
      date: input.date,
      time: input.time,
      category: input.category,
      description: input.description,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "event.created",
      resourceType: "Event",
      resourceId: event._id.toString(),
      after: { title: event.title, date: event.date, category: event.category },
    });

    return event;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateEventInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();
    await EventCategoryService.assertValidCode(organizationId, patch.category);

    const event = await EventModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!event) throw new NotFoundError("Event not found in this organization");

    const before = { title: event.title, date: event.date, category: event.category };
    event.title = patch.title;
    event.date = patch.date;
    event.time = patch.time;
    event.category = patch.category;
    event.description = patch.description;
    await event.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "event.updated",
      resourceType: "Event",
      resourceId: event._id.toString(),
      before,
      after: { title: event.title, date: event.date, category: event.category },
    });

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
