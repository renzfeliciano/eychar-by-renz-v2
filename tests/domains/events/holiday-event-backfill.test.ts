import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EventModel, OrganizationModel } from "@/server/db/models";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { backfillHolidayEvents } from "@/domains/events/holiday-event-backfill";

async function newOrg() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-holiday-backfill-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await EventCategoryService.create({ organizationId, code: "meeting", name: "Meeting" }, {});
  // Saved before the isHoliday flag existed: the seeded code still counts.
  await EventCategoryService.create({ organizationId, code: "holiday", name: "Holiday" }, {});
  return { organization, organizationId };
}

/** An event as saved before ADR-049: a holiday category, no holiday type. */
const legacyEvent = (organizationId: unknown, title: string, date: string, extra: Record<string, unknown> = {}) =>
  EventModel.create({ organizationId, title, date: new Date(date), category: "holiday", ...extra });

const september = (organizationId: string) => HolidayService.listBetween(organizationId, "2026-09-01", "2026-09-30");

describe("backfillHolidayEvents", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("only lists the events on a dry run", async () => {
    const { organization, organizationId } = await newOrg();
    await legacyEvent(organization._id, "Founding day", "2026-09-10");
    const lines: string[] = [];

    const counts = await backfillHolidayEvents({ apply: false, organizationId, log: (line) => lines.push(line) });
    expect(counts).toEqual({ found: 1, updated: 0, added: 0, alreadyOnCalendar: 0 });
    expect(lines).toEqual([`${organizationId}  2026-09-10  Founding day`]);
    expect(await september(organizationId)).toEqual([]);
  });

  it("gives old holiday events the chosen type and puts them on the holiday calendar, once", async () => {
    const { organization, organizationId } = await newOrg();
    const founding = await legacyEvent(organization._id, "Founding day", "2026-09-10");
    await legacyEvent(organization._id, "Fiesta", "2026-09-20", { status: "cancelled" });
    await EventModel.create({ organizationId: organization._id, title: "Town hall", date: new Date("2026-09-11"), category: "meeting" });
    await HolidayService.create({ organizationId, date: "2026-09-25", name: "City day", type: "regular" }, {});
    await legacyEvent(organization._id, "City day", "2026-09-25");

    const counts = await backfillHolidayEvents({ apply: true, holidayType: "special_non_working", organizationId });
    expect(counts).toEqual({ found: 2, updated: 2, added: 1, alreadyOnCalendar: 1 });
    expect((await EventModel.findById(founding._id).lean<{ holidayType?: string }>())?.holidayType).toBe("special_non_working");
    expect(await september(organizationId)).toEqual([
      expect.objectContaining({ date: "2026-09-10", name: "Founding day", type: "special_non_working", eventId: founding._id.toString() }),
      expect.objectContaining({ date: "2026-09-25", name: "City day", eventId: null }),
    ]);

    expect(await backfillHolidayEvents({ apply: true, holidayType: "regular", organizationId })).toEqual({ found: 0, updated: 0, added: 0, alreadyOnCalendar: 0 });
  });

  it("refuses to apply without a holiday type", async () => {
    await expect(backfillHolidayEvents({ apply: true })).rejects.toThrow(/holiday type/);
  });
});
