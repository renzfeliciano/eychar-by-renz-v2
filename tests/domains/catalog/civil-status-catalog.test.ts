import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel } from "@/server/db/models";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { CivilStatusService } from "@/domains/catalog/civil-status-service";
import { CIVIL_STATUS_DEFAULTS } from "@/domains/catalog/civil-status-defaults";
import { catalogChoiceName, catalogChoiceOptions } from "@/domains/catalog/catalog-choice-options";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-civil-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("the civil-statuses catalog", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is a registered catalog with its own permission keys, so Settings and the catalog API pick it up", () => {
    expect(isCatalogTypeSlug("civil-statuses")).toBe(true);
    expect(CATALOG_REGISTRY["civil-statuses"].permissionPrefix).toBe("civil-statuses");
    expect(CATALOG_REGISTRY["civil-statuses"].service).toBe(CivilStatusService);
  });

  it("starts from the Philippine civil statuses, with short stable codes", () => {
    expect(CIVIL_STATUS_DEFAULTS).toEqual([
      { code: "single", name: "Single", sortOrder: 0 },
      { code: "married", name: "Married", sortOrder: 1 },
      { code: "widowed", name: "Widowed", sortOrder: 2 },
      { code: "legally_separated", name: "Legally separated", sortOrder: 3 },
      { code: "annulled", name: "Annulled", sortOrder: 4 },
    ]);
  });

  it("lets HR add a status, and audits it under its own action", async () => {
    const organization = await seedOrganization("add");
    const item = await CivilStatusService.create({ organizationId: organization._id.toString(), name: "Solo parent", sortOrder: 5 }, {});

    expect(item.code).toBe("solo_parent");
    const audit = await AuditLogModel.findOne({ resourceId: item._id, action: "civil-status.created" }).lean();
    expect(audit?.after).toMatchObject({ name: "Solo parent" });
  });

  it("accepts only an active status once the catalog is set up", async () => {
    const organization = await seedOrganization("valid");
    const organizationId = organization._id.toString();
    const item = await CivilStatusService.create({ organizationId, code: "married", name: "Married" }, {});

    await expect(CivilStatusService.assertValidCode(organizationId, "married")).resolves.toBeUndefined();
    await expect(CivilStatusService.assertValidCode(organizationId, "complicated")).rejects.toThrow(BusinessRuleError);
    await CivilStatusService.updateStatus(item._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(CivilStatusService.assertValidCode(organizationId, "married")).rejects.toThrow(BusinessRuleError);
  });
});

describe("catalog choices for a dropdown", () => {
  const items = [
    { code: "single", name: "Single" },
    { code: "married", name: "Married" },
    { code: "widowed", name: "Widowed", status: "inactive" },
  ];

  it("offers the active items, plus the person's own retired or unknown value so it never blanks", () => {
    expect(catalogChoiceOptions(items)).toEqual([
      { id: "single", label: "Single" },
      { id: "married", label: "Married" },
    ]);
    expect(catalogChoiceOptions(items, "widowed").at(-1)).toEqual({ id: "widowed", label: "Widowed (retired)" });
    expect(catalogChoiceOptions(items, "Married (old)").at(-1)).toEqual({ id: "Married (old)", label: "Married (old)" });
  });

  it("names a code by its catalog item, or shows the code as stored, or nothing", () => {
    expect(catalogChoiceName(items, "married")).toBe("Married");
    expect(catalogChoiceName(items, "widowed")).toBe("Widowed");
    expect(catalogChoiceName(items, "unknown_code")).toBe("unknown_code");
    expect(catalogChoiceName(items, undefined)).toBe("");
  });
});
