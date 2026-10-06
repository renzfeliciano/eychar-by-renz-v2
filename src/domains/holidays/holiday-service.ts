import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { HolidayModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import type { CreateHolidayInput, ImportHolidayPresetInput, UpdateHolidayInput } from "@/shared/validation/holidays";
import type { HolidayType, HolidayView } from "./holiday-types";
import { holidayPreset, type PresetHoliday, type PresetYear } from "./presets";

export type PresetPreview = Omit<PresetYear, "entries"> & { country: string; entries: (PresetHoliday & { alreadyAdded: boolean })[] };

type HolidayDoc = { _id: Types.ObjectId; date: Date; name: string; type: string; scope?: string | null; source?: string | null; presetKey?: string | null; eventId?: Types.ObjectId | null };

/** What a company-calendar event puts on the holiday calendar; `null` when it no longer should. */
export type EventHoliday = { date: string; name: string; type: HolidayType } | null;

export function toHolidayView(doc: HolidayDoc): HolidayView {
  return {
    id: doc._id.toString(),
    date: dateToDateKey(doc.date),
    name: doc.name,
    type: doc.type as HolidayType,
    scope: doc.scope || null,
    source: doc.source || null,
    presetKey: doc.presetKey || null,
    eventId: doc.eventId ? doc.eventId.toString() : null,
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A holiday an event put on the calendar follows that event, so it's changed from the company calendar. */
function assertNotFromEvent(holiday: { name: string; eventId?: Types.ObjectId | null }) {
  if (holiday.eventId) throw new BusinessRuleError(`${holiday.name} comes from the company calendar. Change or cancel the event there.`);
}

async function assertNotDuplicate(organizationId: Types.ObjectId, date: Date, name: string, exceptId?: Types.ObjectId) {
  const sameDay = await HolidayModel.find({ organizationId, date, status: "active", ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .select("name")
    .lean<{ name: string }[]>();
  if (sameDay.some((holiday) => sameName(holiday.name, name))) throw new ConflictError(`${name} is already on the calendar for that day`);
}

/**
 * The organization's holiday calendar (ADR-035). HR-owned data: a country
 * preset only proposes days, which HR reviews before anything is saved.
 */
export const HolidayService = {
  /** Active holidays from `from` to `to` (both "YYYY-MM-DD", inclusive), in date order. */
  async listBetween(organizationId: string, from: string, to: string): Promise<HolidayView[]> {
    await connectMongoDB();
    const docs = await HolidayModel.find({
      organizationId: new Types.ObjectId(organizationId),
      status: "active",
      date: { $gte: dateKeyToDate(from), $lte: dateKeyToDate(to) },
    })
      .sort({ date: 1, name: 1 })
      .lean<HolidayDoc[]>();
    return docs.map(toHolidayView);
  },

  async listForYear(organizationId: string, year: number): Promise<HolidayView[]> {
    return this.listBetween(organizationId, `${year}-01-01`, `${year}-12-31`);
  },

  async create(input: CreateHolidayInput, actor: { userId?: string }): Promise<HolidayView> {
    await connectMongoDB();
    const organizationId = new Types.ObjectId(input.organizationId);
    const date = dateKeyToDate(input.date);
    await assertNotDuplicate(organizationId, date, input.name);

    const holiday = await HolidayModel.create({ organizationId, date, name: input.name, type: input.type, scope: input.scope || undefined, source: input.source || undefined });
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "holiday.created",
      resourceType: "Holiday",
      resourceId: holiday._id.toString(),
      after: { date: input.date, name: holiday.name, type: holiday.type },
    });
    return toHolidayView(holiday);
  },

  async update(id: string, organizationId: string, patch: Omit<UpdateHolidayInput, "organizationId">, actor: { userId?: string }): Promise<HolidayView> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const holiday = await HolidayModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgObjectId, status: "active" });
    if (!holiday) throw new NotFoundError("Holiday not found in this organization");
    assertNotFromEvent(holiday);

    const date = dateKeyToDate(patch.date);
    await assertNotDuplicate(orgObjectId, date, patch.name, holiday._id);
    const before = { date: dateToDateKey(holiday.date), name: holiday.name, type: holiday.type };
    holiday.date = date;
    holiday.name = patch.name;
    holiday.type = patch.type;
    holiday.scope = patch.scope || undefined;
    holiday.source = patch.source || undefined;
    await holiday.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "holiday.updated",
      resourceType: "Holiday",
      resourceId: id,
      before,
      after: { date: patch.date, name: holiday.name, type: holiday.type },
    });
    return toHolidayView(holiday);
  },

  /** Takes a holiday off the calendar (kept, marked cancelled). */
  async cancel(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();
    const holiday = await HolidayModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!holiday) throw new NotFoundError("Holiday not found in this organization");
    if (holiday.status === "cancelled") throw new BusinessRuleError("This holiday is already removed");
    assertNotFromEvent(holiday);
    holiday.status = "cancelled";
    await holiday.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "holiday.cancelled",
      resourceType: "Holiday",
      resourceId: id,
      before: { status: "active", date: dateToDateKey(holiday.date), name: holiday.name },
      after: { status: "cancelled" },
    });
    return toHolidayView(holiday);
  },

  /**
   * Keeps the holiday a company-calendar event owns in step with it
   * (ADR-049): adds it, moves or renames it, or takes it off when the event
   * stops being a holiday or is cancelled. A day already on the calendar
   * under the same name (say, loaded from the Philippine list) isn't added
   * twice; the event's own copy is taken off instead.
   */
  async syncFromEvent(organizationId: string, eventId: string, wanted: EventHoliday, actor: { userId?: string }): Promise<HolidayView | null> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const linked = await HolidayModel.findOne({ organizationId: orgObjectId, eventId: new Types.ObjectId(eventId), status: "active" });

    const takeOff = async () => {
      if (!linked) return null;
      linked.status = "cancelled";
      await linked.save();
      await AuditService.record({
        organizationId,
        actorUserId: actor.userId,
        action: "holiday.cancelled",
        resourceType: "Holiday",
        resourceId: linked._id.toString(),
        before: { status: "active", date: dateToDateKey(linked.date), name: linked.name },
        after: { status: "cancelled", eventId },
      });
      return null;
    };

    if (!wanted) return takeOff();
    const date = dateKeyToDate(wanted.date);
    const sameDay = await HolidayModel.find({ organizationId: orgObjectId, date, status: "active", ...(linked ? { _id: { $ne: linked._id } } : {}) })
      .select("name")
      .lean<{ name: string }[]>();
    if (sameDay.some((holiday) => sameName(holiday.name, wanted.name))) return takeOff();

    if (linked) {
      const before = { date: dateToDateKey(linked.date), name: linked.name, type: linked.type };
      if (before.date === wanted.date && before.name === wanted.name && before.type === wanted.type) return toHolidayView(linked);
      linked.date = date;
      linked.name = wanted.name;
      linked.type = wanted.type;
      await linked.save();
      await AuditService.record({
        organizationId,
        actorUserId: actor.userId,
        action: "holiday.updated",
        resourceType: "Holiday",
        resourceId: linked._id.toString(),
        before,
        after: { date: wanted.date, name: wanted.name, type: wanted.type, eventId },
      });
      return toHolidayView(linked);
    }

    const holiday = await HolidayModel.create({ organizationId: orgObjectId, date, name: wanted.name, type: wanted.type, eventId: new Types.ObjectId(eventId) });
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "holiday.created",
      resourceType: "Holiday",
      resourceId: holiday._id.toString(),
      after: { date: wanted.date, name: holiday.name, type: holiday.type, eventId },
    });
    return toHolidayView(holiday);
  },

  /** What a country preset proposes for a year, each day flagged if it's already on the calendar. */
  async previewPreset(organizationId: string, presetKey: string, year: number): Promise<PresetPreview> {
    const preset = holidayPreset(presetKey);
    if (!preset) throw new ValidationError(`No holiday preset called ${presetKey}`);
    const proposal = preset.forYear(year);
    const existing = await this.listForYear(organizationId, year);
    return {
      ...proposal,
      country: preset.country,
      entries: proposal.entries.map((item) => ({ ...item, alreadyAdded: existing.some((holiday) => holiday.date === item.date && sameName(holiday.name, item.name)) })),
    };
  },

  /** Saves the chosen days of a preset; days already on the calendar are skipped, not duplicated. */
  async importPreset(input: ImportHolidayPresetInput, actor: { userId?: string }): Promise<{ added: number; skipped: number }> {
    await connectMongoDB();
    const preview = await this.previewPreset(input.organizationId, input.preset, input.year);
    const wanted = new Set(input.dates);
    const unknown = input.dates.filter((date) => !preview.entries.some((item) => item.date === date));
    if (unknown.length) throw new ValidationError(`Not in the ${preview.country} ${input.year} list: ${unknown.join(", ")}`);

    const chosen = preview.entries.filter((item) => wanted.has(item.date));
    const toAdd = chosen.filter((item) => !item.alreadyAdded);
    if (toAdd.length) {
      await HolidayModel.insertMany(
        toAdd.map((item) => ({
          organizationId: new Types.ObjectId(input.organizationId),
          date: dateKeyToDate(item.date),
          name: item.name,
          type: item.type,
          source: item.source,
          presetKey: input.preset,
        })),
      );
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "holiday.preset_imported",
      // The calendar as a whole changed, so the entry points at the organization.
      resourceType: "HolidayCalendar",
      resourceId: input.organizationId,
      after: { preset: input.preset, year: input.year, verified: preview.verified, added: toAdd.map((item) => `${item.date} ${item.name}`) },
    });
    return { added: toAdd.length, skipped: chosen.length - toAdd.length };
  },
};
