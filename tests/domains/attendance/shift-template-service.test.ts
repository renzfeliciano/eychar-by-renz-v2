import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, AuditLogModel } from "@/server/db/models";
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

  describe("update", () => {
    it("switches a work shift to a rest day by clearing its times", async () => {
      const organizationId = await seedOrganization("6");
      const shift = await ShiftTemplateService.create({ organizationId, name: "Half", code: "H", kind: "work", startTime: "08:00", endTime: "12:00" }, {});

      const updated = await ShiftTemplateService.update(shift._id.toString(), organizationId, { kind: "rest", startTime: "", endTime: "" }, {});

      expect(updated.kind).toBe("rest");
      expect(updated.startTime).toBeUndefined();
      expect(updated.endTime).toBeUndefined();
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
