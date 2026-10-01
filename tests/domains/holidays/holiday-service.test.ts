import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel } from "@/server/db/models";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { DayNoteService } from "@/domains/holidays/day-note-service";
import { ConflictError, ValidationError } from "@/shared/errors";

async function newOrg() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-holiday-${Date.now()}-${Math.random()}` });
  return organization._id.toString();
}

describe("HolidayService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("adds a holiday, refuses the same one twice, and lists by range", async () => {
    const orgId = await newOrg();
    await HolidayService.create({ organizationId: orgId, date: "2026-08-08", name: "Cebu Charter Day", type: "special_non_working", scope: "Cebu City" }, {});
    await expect(HolidayService.create({ organizationId: orgId, date: "2026-08-08", name: "cebu charter day", type: "regular" }, {})).rejects.toThrow(ConflictError);

    const august = await HolidayService.listBetween(orgId, "2026-08-01", "2026-08-31");
    expect(august).toEqual([expect.objectContaining({ date: "2026-08-08", name: "Cebu Charter Day", scope: "Cebu City", presetKey: null })]);
    expect(await HolidayService.listBetween(orgId, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("removes (cancels) a holiday so it no longer lists, and audits it", async () => {
    const orgId = await newOrg();
    const holiday = await HolidayService.create({ organizationId: orgId, date: "2026-10-10", name: "Typo day", type: "regular" }, {});
    await HolidayService.cancel(holiday.id, orgId, {});
    expect(await HolidayService.listForYear(orgId, 2026)).toEqual([]);
    expect(await AuditLogModel.countDocuments({ action: "holiday.cancelled", resourceId: holiday.id })).toBe(1);
  });

  it("previews a preset, saves only the picked days, and never duplicates", async () => {
    const orgId = await newOrg();
    const preview = await HolidayService.previewPreset(orgId, "PH", 2026);
    expect(preview.entries.every((entry) => !entry.alreadyAdded)).toBe(true);

    const first = await HolidayService.importPreset({ organizationId: orgId, preset: "PH", year: 2026, dates: ["2026-01-01", "2026-12-25"] }, {});
    expect(first).toEqual({ added: 2, skipped: 0 });

    const again = await HolidayService.importPreset({ organizationId: orgId, preset: "PH", year: 2026, dates: ["2026-12-25", "2026-12-30"] }, {});
    expect(again).toEqual({ added: 1, skipped: 1 });

    const saved = await HolidayService.listForYear(orgId, 2026);
    expect(saved.map((holiday) => holiday.date)).toEqual(["2026-01-01", "2026-12-25", "2026-12-30"]);
    expect(saved[0]).toMatchObject({ presetKey: "PH", source: "Proclamation No. 1006, s. 2025" });
    expect((await HolidayService.previewPreset(orgId, "PH", 2026)).entries.filter((entry) => entry.alreadyAdded)).toHaveLength(3);
  });

  it("rejects days that aren't in the preset, and unknown presets", async () => {
    const orgId = await newOrg();
    await expect(HolidayService.importPreset({ organizationId: orgId, preset: "PH", year: 2026, dates: ["2026-03-03"] }, {})).rejects.toThrow(ValidationError);
    await expect(HolidayService.previewPreset(orgId, "XX", 2026)).rejects.toThrow(ValidationError);
  });
});

describe("DayNoteService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("saves, replaces and clears a day's note", async () => {
    const orgId = await newOrg();
    await DayNoteService.save({ organizationId: orgId, date: "2026-10-09", note: "Skeleton crew" }, {});
    await DayNoteService.save({ organizationId: orgId, date: "2026-10-09", note: "Office closed" }, {});
    expect(await DayNoteService.listBetween(orgId, "2026-10-01", "2026-10-31")).toEqual({ "2026-10-09": "Office closed" });

    await DayNoteService.save({ organizationId: orgId, date: "2026-10-09", note: "" }, {});
    expect(await DayNoteService.listBetween(orgId, "2026-10-01", "2026-10-31")).toEqual({});
    expect(await AuditLogModel.countDocuments({ organizationId: orgId, action: { $in: ["day_note.saved", "day_note.cleared"] } })).toBe(3);
  });
});
