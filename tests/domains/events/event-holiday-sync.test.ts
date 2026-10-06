import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { EventService } from "@/domains/events/event-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { createEventSchema } from "@/shared/validation/events";

async function newOrg() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-event-holiday-${Date.now()}-${Math.random()}` });
  const orgId = organization._id.toString();
  await EventCategoryService.create({ organizationId: orgId, code: "meeting", name: "Meeting" }, {});
  await EventCategoryService.create({ organizationId: orgId, code: "day_off", name: "Company day off", metadata: { isHoliday: true } }, {});
  return orgId;
}

const september = (orgId: string) => HolidayService.listBetween(orgId, "2026-09-01", "2026-09-30");

describe("Holiday events on the holiday calendar (ADR-049)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("puts an event in a holiday category on the holiday calendar, linked to the event", async () => {
    const orgId = await newOrg();
    const event = await EventService.create(
      { organizationId: orgId, title: "Founding anniversary", date: new Date("2026-09-10"), category: "day_off", holidayType: "special_non_working" },
      {},
    );

    expect(event.holidayType).toBe("special_non_working");
    expect(await september(orgId)).toEqual([
      expect.objectContaining({ date: "2026-09-10", name: "Founding anniversary", type: "special_non_working", eventId: event._id.toString() }),
    ]);
  });

  it("asks for the holiday type on a holiday event, and ignores it on any other", async () => {
    const orgId = await newOrg();
    await expect(EventService.create({ organizationId: orgId, title: "Day off", date: new Date("2026-09-10"), category: "day_off" }, {})).rejects.toThrow(ValidationError);

    const meeting = await EventService.create({ organizationId: orgId, title: "Town hall", date: new Date("2026-09-11"), category: "meeting", holidayType: "regular" }, {});
    expect(meeting.holidayType).toBeUndefined();
    expect(await september(orgId)).toEqual([]);
  });

  it("treats the seeded holiday code as a holiday when its item has no flag yet", async () => {
    const orgId = await newOrg();
    await EventCategoryService.create({ organizationId: orgId, code: "holiday", name: "Holiday" }, {});
    await EventService.create({ organizationId: orgId, title: "Town fiesta", date: new Date("2026-09-15"), category: "holiday", holidayType: "special_working" }, {});

    expect(await september(orgId)).toEqual([expect.objectContaining({ name: "Town fiesta", type: "special_working" })]);
  });

  it("moves and renames the holiday with its event, and takes it off when the event stops being a holiday", async () => {
    const orgId = await newOrg();
    const event = await EventService.create({ organizationId: orgId, title: "Founding day", date: new Date("2026-09-10"), category: "day_off", holidayType: "regular" }, {});
    const id = event._id.toString();

    await EventService.update(id, orgId, { title: "Founding anniversary", date: new Date("2026-09-12"), category: "day_off", holidayType: "special_non_working" }, {});
    const moved = await september(orgId);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ date: "2026-09-12", name: "Founding anniversary", type: "special_non_working", eventId: id });

    const updated = await EventService.update(id, orgId, { title: "Founding anniversary lunch", date: new Date("2026-09-12"), category: "meeting" }, {});
    expect(updated.holidayType).toBeUndefined();
    expect(await september(orgId)).toEqual([]);

    // Back to a holiday: it returns to the calendar.
    await EventService.update(id, orgId, { title: "Founding anniversary", date: new Date("2026-09-12"), category: "day_off", holidayType: "regular" }, {});
    expect(await september(orgId)).toEqual([expect.objectContaining({ name: "Founding anniversary", eventId: id })]);
  });

  it("takes the holiday off the calendar when its event is cancelled", async () => {
    const orgId = await newOrg();
    const event = await EventService.create({ organizationId: orgId, title: "Founding day", date: new Date("2026-09-10"), category: "day_off", holidayType: "regular" }, {});

    await EventService.cancel(event._id.toString(), orgId, {});
    expect(await september(orgId)).toEqual([]);
  });

  it("doesn't add a day that's already on the calendar under the same name", async () => {
    const orgId = await newOrg();
    await HolidayService.create({ organizationId: orgId, date: "2026-09-10", name: "Founding Day", type: "regular" }, {});
    await EventService.create({ organizationId: orgId, title: "founding day", date: new Date("2026-09-10"), category: "day_off", holidayType: "regular" }, {});

    expect(await september(orgId)).toEqual([expect.objectContaining({ name: "Founding Day", eventId: null })]);
  });

  it("refuses to edit or remove an event's holiday from the holiday calendar", async () => {
    const orgId = await newOrg();
    const event = await EventService.create({ organizationId: orgId, title: "Founding day", date: new Date("2026-09-10"), category: "day_off", holidayType: "regular" }, {});
    const [holiday] = await september(orgId);

    await expect(HolidayService.update(holiday.id, orgId, { date: "2026-09-11", name: "Moved", type: "regular" }, {})).rejects.toThrow(BusinessRuleError);
    await expect(HolidayService.cancel(holiday.id, orgId, {})).rejects.toThrow(BusinessRuleError);
    expect(await september(orgId)).toEqual([expect.objectContaining({ date: "2026-09-10", eventId: event._id.toString() })]);
  });

  it("leaves the holiday alone when another organization tries to change or cancel its event", async () => {
    const orgId = await newOrg();
    const otherOrgId = await newOrg();
    const event = await EventService.create({ organizationId: orgId, title: "Founding day", date: new Date("2026-09-10"), category: "day_off", holidayType: "regular" }, {});
    const id = event._id.toString();

    await expect(EventService.update(id, otherOrgId, { title: "Hijacked", date: new Date("2026-09-11"), category: "meeting" }, {})).rejects.toThrow(NotFoundError);
    await expect(EventService.cancel(id, otherOrgId, {})).rejects.toThrow(NotFoundError);
    expect(await september(orgId)).toEqual([expect.objectContaining({ date: "2026-09-10", name: "Founding day" })]);
    expect(await september(otherOrgId)).toEqual([]);
  });

  it("rejects a holiday type that isn't one of the known kinds", () => {
    const parsed = createEventSchema.safeParse({ organizationId: "507f1f77bcf86cd799439011", title: "Day off", date: "2026-09-10", category: "day_off", holidayType: "half_day" });
    expect(parsed.success).toBe(false);
  });
});
