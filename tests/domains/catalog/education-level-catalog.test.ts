import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel } from "@/server/db/models";
import { CATALOG_REGISTRY, isCatalogTypeSlug } from "@/domains/catalog/catalog-registry";
import { EducationLevelService } from "@/domains/catalog/education-level-service";
import { EDUCATION_LEVEL_DEFAULTS } from "@/domains/catalog/education-level-defaults";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-edu-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("the education-levels catalog", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is a registered catalog with its own permission keys, so Settings and the catalog API pick it up", () => {
    expect(isCatalogTypeSlug("education-levels")).toBe(true);
    expect(CATALOG_REGISTRY["education-levels"].permissionPrefix).toBe("education-levels");
    expect(CATALOG_REGISTRY["education-levels"].service).toBe(EducationLevelService);
  });

  it("starts from the owner's ten levels, in the owner's order", () => {
    expect(EDUCATION_LEVEL_DEFAULTS.map((level) => level.name)).toEqual([
      "Elementary Graduate",
      "High School / Junior High School Graduate",
      "Senior High School Graduate",
      "Technical-Vocational / TESDA Certificate",
      "College Undergraduate",
      "Associate Degree",
      "Bachelor’s Degree",
      "Post-Graduate Diploma / Units",
      "Master’s Degree",
      "Doctoral / Professional Degree",
    ]);
    expect(EDUCATION_LEVEL_DEFAULTS.map((level) => level.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("gives every default a short, unique, URL-safe code", () => {
    const codes = EDUCATION_LEVEL_DEFAULTS.map((level) => level.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
  });

  it("lets HR add a level, and audits it under its own action", async () => {
    const organization = await seedOrganization("add");
    const item = await EducationLevelService.create({ organizationId: organization._id.toString(), name: "Vocational Diploma", sortOrder: 10 }, {});

    expect(item.code).toBe("vocational_diploma");
    const audit = await AuditLogModel.findOne({ resourceId: item._id, action: "education-level.created" }).lean();
    expect(audit?.after).toMatchObject({ name: "Vocational Diploma" });
  });

  it("accepts only an active level once the catalog is set up, and anything before", async () => {
    const organization = await seedOrganization("valid");
    const organizationId = organization._id.toString();

    await expect(EducationLevelService.assertValidCode(organizationId, "anything")).resolves.toBeUndefined();

    const level = await EducationLevelService.create({ organizationId, code: "masters_degree", name: "Master’s Degree" }, {});
    await expect(EducationLevelService.assertValidCode(organizationId, "masters_degree")).resolves.toBeUndefined();
    await expect(EducationLevelService.assertValidCode(organizationId, "not_a_level")).rejects.toThrow(BusinessRuleError);

    await EducationLevelService.updateStatus(level._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(EducationLevelService.assertValidCode(organizationId, "masters_degree")).rejects.toThrow(BusinessRuleError);
  });

  it("keeps one organization's levels out of another's", async () => {
    const a = await seedOrganization("a");
    const b = await seedOrganization("b");
    await EducationLevelService.create({ organizationId: a._id.toString(), code: "masters_degree", name: "Master’s Degree" }, {});

    expect(await EducationLevelService.listCurrent(b._id.toString())).toEqual([]);
    expect(await EducationLevelService.getByCode(b._id.toString(), "masters_degree")).toBeNull();
  });
});
