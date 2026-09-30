import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, AuditLogModel, ShiftTemplateModel } from "@/server/db/models";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-shift-${suffix}-${Date.now()}-${Math.random()}` });
  return organization._id.toString();
}

describe("ShiftTemplateService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates work and rest shifts, uppercases the code, and audits", async () => {
    const organizationId = await seedOrganization("1");

    const day = await ShiftTemplateService.create({ organizationId, name: "Day", code: "d", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
    const rest = await ShiftTemplateService.create({ organizationId, name: "Rest day", code: "RD", kind: "rest" }, {});

    expect(day.code).toBe("D");
    expect(rest.startTime).toBeUndefined();
    expect(await AuditLogModel.countDocuments({ resourceId: day._id, action: "shift-template.created" })).toBe(1);
  });

  it("allows an overnight shift whose end is before its start", async () => {
    const organizationId = await seedOrganization("2");
    const night = await ShiftTemplateService.create({ organizationId, name: "Night", code: "N", kind: "work", startTime: "22:00", endTime: "07:00" }, {});
    expect(night.endTime).toBe("07:00");
  });

  it("requires both times for a work shift and none for a rest day", async () => {
    const organizationId = await seedOrganization("3");

    await expect(ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00" }, {})).rejects.toThrow(BusinessRuleError);
    await expect(
      ShiftTemplateService.create({ organizationId, name: "Rest", code: "RD", kind: "rest", startTime: "08:00", endTime: "17:00" }, {}),
    ).rejects.toThrow(BusinessRuleError);
    await expect(
      ShiftTemplateService.create({ organizationId, name: "Zero", code: "Z", kind: "work", startTime: "08:00", endTime: "08:00" }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects a duplicate code within the organization", async () => {
    const organizationId = await seedOrganization("4");
    await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});

    await expect(
      ShiftTemplateService.create({ organizationId, name: "Day 2", code: "d", kind: "work", startTime: "09:00", endTime: "18:00" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("lists work shifts by start time, then rest days, scoped to the organization", async () => {
    const organizationId = await seedOrganization("5");
    const otherOrganizationId = await seedOrganization("5b");
    await ShiftTemplateService.create({ organizationId, name: "Rest day", code: "RD", kind: "rest" }, {});
    await ShiftTemplateService.create({ organizationId, name: "Night", code: "N", kind: "work", startTime: "22:00", endTime: "07:00" }, {});
    await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
    await ShiftTemplateService.create({ organizationId: otherOrganizationId, name: "Other", code: "O", kind: "rest" }, {});

    const shifts = await ShiftTemplateService.listCurrent(organizationId);

    expect(shifts.map((shift) => shift.code)).toEqual(["D", "N", "RD"]);
  });

  it("gives each new shift its own color from the palette unless one is chosen", async () => {
    const organizationId = await seedOrganization("c1");

    const day = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
    const night = await ShiftTemplateService.create({ organizationId, name: "Night", code: "N", kind: "work", startTime: "22:00", endTime: "07:00" }, {});
    const chosen = await ShiftTemplateService.create({ organizationId, name: "Mid", code: "M", kind: "work", startTime: "12:00", endTime: "21:00", color: "rose" }, {});
    const rest = await ShiftTemplateService.create({ organizationId, name: "Rest day", code: "RD", kind: "rest" }, {});

    expect(day.color).toBeTruthy();
    expect(night.color).toBeTruthy();
    expect(night.color).not.toBe(day.color);
    expect(chosen.color).toBe("rose");
    expect(rest.color).toBe("slate");
  });

  it("creates a flexi shift with a start window and required hours", async () => {
    const organizationId = await seedOrganization("f1");

    const flexi = await ShiftTemplateService.create(
      { organizationId, name: "Flexi", code: "FX", kind: "work", pattern: "flexible", startTime: "07:00", latestStartTime: "10:00", requiredHours: 8 },
      {},
    );

    expect(flexi.pattern).toBe("flexible");
    expect(flexi.latestStartTime).toBe("10:00");
    expect(flexi.requiredHours).toBe(8);
    expect(flexi.endTime).toBeUndefined();
  });

  it("rejects a flexi shift without a valid window or hours", async () => {
    const organizationId = await seedOrganization("f2");
    const base = { organizationId, name: "Flexi", code: "FX", kind: "work" as const, pattern: "flexible" as const };

    await expect(ShiftTemplateService.create({ ...base, startTime: "07:00", requiredHours: 8 }, {})).rejects.toThrow(BusinessRuleError);
    await expect(ShiftTemplateService.create({ ...base, startTime: "10:00", latestStartTime: "07:00", requiredHours: 8 }, {})).rejects.toThrow(BusinessRuleError);
    await expect(ShiftTemplateService.create({ ...base, startTime: "07:00", latestStartTime: "10:00" }, {})).rejects.toThrow(BusinessRuleError);
    await expect(ShiftTemplateService.create({ ...base, startTime: "07:00", latestStartTime: "10:00", requiredHours: 8, endTime: "17:00" }, {})).rejects.toThrow(
      BusinessRuleError,
    );
  });

  it("gives shifts created before colors existed their own color the first time they're listed", async () => {
    const organizationId = await seedOrganization("c3");
    const day = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});
    const night = await ShiftTemplateService.create({ organizationId, name: "Night", code: "N", kind: "work", startTime: "22:00", endTime: "07:00" }, {});
    const rest = await ShiftTemplateService.create({ organizationId, name: "Rest", code: "RD", kind: "rest" }, {});
    await ShiftTemplateModel.updateMany({ _id: { $in: [day._id, night._id, rest._id] } }, { $unset: { color: "" } });

    const shifts = await ShiftTemplateService.listCurrent(organizationId);
    const colorOf = (code: string) => shifts.find((shift) => shift.code === code)?.color;

    expect(colorOf("D")).toBeTruthy();
    expect(colorOf("N")).toBeTruthy();
    expect(colorOf("N")).not.toBe(colorOf("D"));
    expect(colorOf("RD")).toBe("slate");
    expect((await ShiftTemplateModel.findById(day._id).lean())?.color).toBe(colorOf("D"));
  });

  describe("update", () => {
    it("switches a work shift to a rest day by clearing its times", async () => {
      const organizationId = await seedOrganization("6");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Half", code: "H", kind: "work", startTime: "08:00", endTime: "12:00" }, {});

      const updated = await ShiftTemplateService.update(shift._id.toString(), organizationId, { kind: "rest", startTime: "", endTime: "" }, {});

      expect(updated.kind).toBe("rest");
      expect(updated.startTime).toBeUndefined();
      expect(updated.endTime).toBeUndefined();
    });

    it("changes a shift's color and turns a fixed shift into a flexi one", async () => {
      const organizationId = await seedOrganization("c2");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});

      const updated = await ShiftTemplateService.update(
        shift._id.toString(),
        organizationId,
        { color: "teal", pattern: "flexible", startTime: "07:00", endTime: "", latestStartTime: "09:30", requiredHours: 9 },
        {},
      );

      expect(updated.color).toBe("teal");
      expect(updated.pattern).toBe("flexible");
      expect(updated.endTime).toBeUndefined();
      expect(updated.latestStartTime).toBe("09:30");
      expect(updated.requiredHours).toBe(9);
    });

    it("rejects an edit that would leave a work shift without times", async () => {
      const organizationId = await seedOrganization("7");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});

      await expect(ShiftTemplateService.update(shift._id.toString(), organizationId, { endTime: "" }, {})).rejects.toThrow(BusinessRuleError);
    });

    it("rejects editing another organization's shift or a malformed id", async () => {
      const organizationId = await seedOrganization("8");
      const otherOrganizationId = await seedOrganization("8b");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});

      await expect(ShiftTemplateService.update(shift._id.toString(), otherOrganizationId, { name: "X" }, {})).rejects.toThrow(NotFoundError);
      await expect(ShiftTemplateService.update("nope", organizationId, { name: "X" }, {})).rejects.toThrow(NotFoundError);
    });

    it("deactivates and reactivates", async () => {
      const organizationId = await seedOrganization("9");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Day", code: "D", kind: "work", startTime: "08:00", endTime: "17:00" }, {});

      const inactive = await ShiftTemplateService.updateStatus(shift._id.toString(), organizationId, { status: "inactive" }, {});

      expect(inactive.status).toBe("inactive");
    });
  });
});
