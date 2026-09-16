import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, AuditLogModel } from "@/server/db/models";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { BusinessRuleError, ConflictError } from "@/shared/errors";

// EmploymentTypeService/EmploymentStatusService are createSimpleCatalogService(...)
// instances bound to two different collections — exercising both here proves
// the shared factory works correctly and that each bound model is genuinely
// isolated (a duplicate code in one type's collection doesn't collide with another's).
async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-simplecat-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("createSimpleCatalogService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an item and lists it back", async () => {
    const organization = await seedOrganization("1");

    const item = await EmploymentTypeService.create(
      { organizationId: organization._id.toString(), code: "regular", name: "Regular" },
      {},
    );

    const items = await EmploymentTypeService.listCurrent(organization._id.toString());
    expect(items).toHaveLength(1);
    expect(items[0]._id.toString()).toBe(item._id.toString());
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await seedOrganization("2");
    await EmploymentTypeService.create({ organizationId: organization._id.toString(), code: "regular", name: "Regular" }, {});

    await expect(
      EmploymentTypeService.create({ organizationId: organization._id.toString(), code: "regular", name: "Regular 2" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("allows the same code across two different bound models (isolated collections)", async () => {
    const organization = await seedOrganization("3");
    await EmploymentTypeService.create({ organizationId: organization._id.toString(), code: "active", name: "Regular" }, {});

    const statusItem = await EmploymentStatusService.create(
      { organizationId: organization._id.toString(), code: "active", name: "Active" },
      {},
    );

    expect(statusItem.code).toBe("active");
  });

  it("updateStatus toggles status and audits the change", async () => {
    const organization = await seedOrganization("4");
    const item = await EmploymentTypeService.create({ organizationId: organization._id.toString(), code: "regular", name: "Regular" }, {});

    const updated = await EmploymentTypeService.updateStatus(item._id.toString(), organization._id.toString(), { status: "inactive" }, {});

    expect(updated.status).toBe("inactive");
    const audits = await AuditLogModel.find({ resourceId: item._id, action: "employment-type.updated" }).lean();
    expect(audits).toHaveLength(1);
  });

  describe("assertValidCode", () => {
    it("is permissive when the organization has no items configured", async () => {
      const organization = await seedOrganization("5");
      await expect(EmploymentStatusService.assertValidCode(organization._id.toString(), "anything-goes")).resolves.toBeUndefined();
    });

    it("accepts a code matching a configured active item", async () => {
      const organization = await seedOrganization("6");
      await EmploymentStatusService.create({ organizationId: organization._id.toString(), code: "active", name: "Active" }, {});

      await expect(EmploymentStatusService.assertValidCode(organization._id.toString(), "active")).resolves.toBeUndefined();
    });

    it("rejects a code that doesn't match any configured item once some exist", async () => {
      const organization = await seedOrganization("7");
      await EmploymentStatusService.create({ organizationId: organization._id.toString(), code: "active", name: "Active" }, {});

      await expect(EmploymentStatusService.assertValidCode(organization._id.toString(), "made-up")).rejects.toThrow(BusinessRuleError);
    });

    it("rejects a code belonging to an inactive item", async () => {
      const organization = await seedOrganization("8");
      const item = await EmploymentStatusService.create({ organizationId: organization._id.toString(), code: "active", name: "Active" }, {});
      await EmploymentStatusService.updateStatus(item._id.toString(), organization._id.toString(), { status: "inactive" }, {});

      await expect(EmploymentStatusService.assertValidCode(organization._id.toString(), "active")).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("getByCode", () => {
    it("returns the matching item, or null when there is none", async () => {
      const organization = await seedOrganization("9");
      const item = await EmploymentStatusService.create({ organizationId: organization._id.toString(), code: "active", name: "Active" }, {});

      expect((await EmploymentStatusService.getByCode(organization._id.toString(), "active"))?._id.toString()).toBe(item._id.toString());
      expect(await EmploymentStatusService.getByCode(organization._id.toString(), "missing")).toBeNull();
    });
  });
});
