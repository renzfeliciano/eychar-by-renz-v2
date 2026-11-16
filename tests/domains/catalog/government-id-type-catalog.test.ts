import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel } from "@/server/db/models";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { GovernmentIdTypeService } from "@/domains/catalog/government-id-type-service";
import { GOVERNMENT_ID_TYPE_DEFAULTS } from "@/domains/catalog/government-id-type-defaults";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-govid-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("the government-id-types catalog", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is a registered catalog with its own permission keys, so Settings and the catalog API pick it up", () => {
    expect(isCatalogTypeSlug("government-id-types")).toBe(true);
    expect(CATALOG_REGISTRY["government-id-types"].permissionPrefix).toBe("government-id-types");
    expect(CATALOG_REGISTRY["government-id-types"].service).toBe(GovernmentIdTypeService);
  });

  it("starts from the common Philippine government IDs, with unique stable codes in order", () => {
    const codes = GOVERNMENT_ID_TYPE_DEFAULTS.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(["drivers_license", "passport", "umid", "voters_id", "postal_id", "national_id"]));
    expect(GOVERNMENT_ID_TYPE_DEFAULTS.map((item) => item.sortOrder)).toEqual(GOVERNMENT_ID_TYPE_DEFAULTS.map((_, index) => index));
  });

  it("lets HR add a type, and audits it under its own action", async () => {
    const organization = await seedOrganization("add");
    const item = await GovernmentIdTypeService.create({ organizationId: organization._id.toString(), name: "Firearms License", sortOrder: 20 }, {});

    expect(item.code).toBe("firearms_license");
    const audit = await AuditLogModel.findOne({ resourceId: item._id, action: "government-id-type.created" }).lean();
    expect(audit?.after).toMatchObject({ name: "Firearms License" });
  });

  it("accepts only an active type once the catalog is set up", async () => {
    const organization = await seedOrganization("valid");
    const organizationId = organization._id.toString();
    const item = await GovernmentIdTypeService.create({ organizationId, code: "passport", name: "Passport" }, {});

    await expect(GovernmentIdTypeService.assertValidCode(organizationId, "passport")).resolves.toBeUndefined();
    await expect(GovernmentIdTypeService.assertValidCode(organizationId, "library_card")).rejects.toThrow(BusinessRuleError);
    await GovernmentIdTypeService.updateStatus(item._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(GovernmentIdTypeService.assertValidCode(organizationId, "passport")).rejects.toThrow(BusinessRuleError);
  });
});
