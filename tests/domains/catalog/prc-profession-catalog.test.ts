import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel } from "@/server/db/models";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { PrcProfessionService } from "@/domains/catalog/prc-profession-service";
import { PRC_PROFESSION_DEFAULTS } from "@/domains/catalog/prc-profession-defaults";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-prc-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("the prc-professions catalog", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is a registered catalog with its own permission keys, so Settings and the catalog API pick it up", () => {
    expect(isCatalogTypeSlug("prc-professions")).toBe(true);
    expect(CATALOG_REGISTRY["prc-professions"].permissionPrefix).toBe("prc-professions");
    expect(CATALOG_REGISTRY["prc-professions"].service).toBe(PrcProfessionService);
  });

  it("starts from the common PRC-regulated professions, with unique stable codes in order", () => {
    const codes = PRC_PROFESSION_DEFAULTS.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(["civil_engineer", "electrical_engineer", "mechanical_engineer", "architect", "nurse", "certified_public_accountant", "teacher", "medical_technologist", "pharmacist", "physician"]));
    expect(PRC_PROFESSION_DEFAULTS.map((item) => item.sortOrder)).toEqual(PRC_PROFESSION_DEFAULTS.map((_, index) => index));
  });

  it("lets HR add a profession, and audits it under its own action", async () => {
    const organization = await seedOrganization("add");
    const item = await PrcProfessionService.create({ organizationId: organization._id.toString(), name: "Geologist", sortOrder: 90 }, {});

    expect(item.code).toBe("geologist");
    const audit = await AuditLogModel.findOne({ resourceId: item._id, action: "prc-profession.created" }).lean();
    expect(audit?.after).toMatchObject({ name: "Geologist" });
  });

  it("accepts only an active profession once the catalog is set up", async () => {
    const organization = await seedOrganization("valid");
    const organizationId = organization._id.toString();
    const item = await PrcProfessionService.create({ organizationId, code: "nurse", name: "Nurse" }, {});

    await expect(PrcProfessionService.assertValidCode(organizationId, "nurse")).resolves.toBeUndefined();
    await expect(PrcProfessionService.assertValidCode(organizationId, "wizard")).rejects.toThrow(BusinessRuleError);
    await PrcProfessionService.updateStatus(item._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(PrcProfessionService.assertValidCode(organizationId, "nurse")).rejects.toThrow(BusinessRuleError);
  });
});
