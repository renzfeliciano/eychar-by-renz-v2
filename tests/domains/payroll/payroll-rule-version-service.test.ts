import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, ProjectModel, PayrollRuleVersionModel } from "@/server/db/models";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";

// The PH starter tables; these tests are about versioning and resolution, not the numbers.
const TABLES = { name: "PH", taxTables: PH_STATUTORY_2025.taxTables, contributions: PH_STATUTORY_2025.contributions };

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-prv-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("PayrollRuleVersionService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("auto-increments versionNumber per organization", async () => {
    const organization = await seedOrganization("1");

    const v1 = await PayrollRuleVersionService.create({ organizationId: organization._id.toString(), ...TABLES }, {});
    const v2 = await PayrollRuleVersionService.create({ organizationId: organization._id.toString(), ...TABLES }, {});

    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
  });

  it("starts a separate organization's version numbering from 1", async () => {
    const organizationA = await seedOrganization("2a");
    const organizationB = await seedOrganization("2b");
    await PayrollRuleVersionService.create({ organizationId: organizationA.id, ...TABLES }, {});

    const firstForB = await PayrollRuleVersionService.create({ organizationId: organizationB.id, ...TABLES }, {});

    expect(firstForB.versionNumber).toBe(1);
  });

  it("keeps the tables it was created with and remembers which version it corrects", async () => {
    const organization = await seedOrganization("7");
    const v1 = await PayrollRuleVersionService.create({ organizationId: organization._id.toString(), ...TABLES }, {});
    const v2 = await PayrollRuleVersionService.create(
      { organizationId: organization._id.toString(), ...TABLES, name: "PH (PhilHealth update)", basedOnVersionId: v1._id.toString(), effectiveFrom: "2027-01-01" },
      {},
    );

    const stored = await PayrollRuleVersionService.getById(v2._id.toString(), organization._id.toString());
    expect(stored.basedOnVersionId?.toString()).toBe(v1._id.toString());
    expect(stored.taxTables.map((table: { payFrequency: string }) => table.payFrequency)).toEqual(["weekly", "semi-monthly", "monthly"]);
    expect(stored.contributions.find((rule: { code: string }) => rule.code === "SSS")?.rows).toHaveLength(61);
    expect(stored.effectiveFrom).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });

  describe("resolve", () => {
    it("returns null when no version applies", async () => {
      const organization = await seedOrganization("3");
      const result = await PayrollRuleVersionService.resolve({ organizationId: organization._id.toString(), effectiveDate: new Date() });
      expect(result).toBeNull();
    });

    it("falls back to the org-wide version when no project-specific one exists", async () => {
      const organization = await seedOrganization("4");
      const orgWide = await PayrollRuleVersionService.create({ organizationId: organization._id.toString(), ...TABLES }, {});

      const result = await PayrollRuleVersionService.resolve({ organizationId: organization._id.toString(), effectiveDate: new Date() });

      expect(result?.source).toBe("organization");
      expect(result?.policy._id.toString()).toBe(orgWide._id.toString());
    });

    it("prefers a project-scoped version over the org-wide one", async () => {
      const organization = await seedOrganization("5");
      const project = await ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `PA-${Date.now()}` });
      await PayrollRuleVersionService.create({ organizationId: organization._id.toString(), ...TABLES }, {});
      const projectVersion = await PayrollRuleVersionService.create(
        { organizationId: organization._id.toString(), projectId: project._id.toString(), ...TABLES },
        {},
      );

      const result = await PayrollRuleVersionService.resolve({
        organizationId: organization._id.toString(),
        projectId: project._id.toString(),
        effectiveDate: new Date(),
      });

      expect(result?.source).toBe("project");
      expect(result?.policy._id.toString()).toBe(projectVersion._id.toString());
    });

    it("does not pick a version whose effective window doesn't cover the date", async () => {
      const organization = await seedOrganization("6");
      await PayrollRuleVersionModel.create({
        organizationId: organization._id,
        versionNumber: 1,
        name: "Expired",
        effectiveFrom: new Date("2020-01-01"),
        effectiveTo: new Date("2020-12-31"),
      });

      const result = await PayrollRuleVersionService.resolve({ organizationId: organization._id.toString(), effectiveDate: new Date("2026-01-01") });

      expect(result).toBeNull();
    });
  });
});
