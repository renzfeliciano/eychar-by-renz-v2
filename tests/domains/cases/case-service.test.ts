import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, ProjectModel } from "@/server/db/models";
import { CaseService } from "@/domains/cases/case-service";
import { CaseClassificationService } from "@/domains/catalog/case-classification-service";
import { CaseStatusService } from "@/domains/catalog/case-status-service";

async function seedProject(organizationId: object, suffix: string) {
  return ProjectModel.create({ organizationId, name: `Project ${suffix}`, code: `PRJ-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("CaseService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a case tied to a project, with a case name, number, classification, and status", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-case-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const project = await seedProject(organization._id, "A");

    const created = await CaseService.create(
      {
        organizationId: orgId,
        projectId: project._id.toString(),
        caseName: "Dela Cruz vs. PCAS Corp",
        caseNumber: "NLRC-NCR-01-00123-26",
        classification: "civil_case",
        status: "pending",
      },
      {},
    );

    expect(created.caseName).toBe("Dela Cruz vs. PCAS Corp");
    expect(created.caseNumber).toBe("NLRC-NCR-01-00123-26");
    expect(created.projectId.toString()).toBe(project._id.toString());
  });

  it("rejects a project that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-case-badproj-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-case-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignProject = await seedProject(otherOrg._id, "FOREIGN");

    await expect(
      CaseService.create(
        { organizationId: orgId, projectId: foreignProject._id.toString(), caseName: "Case", caseNumber: "1", classification: "civil_case", status: "pending" },
        {},
      ),
    ).rejects.toThrow();
  });

  it("rejects an unconfigured classification or status once the org has configured its own", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-case-bad-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const project = await seedProject(organization._id, "B");
    await CaseClassificationService.create({ organizationId: orgId, code: "civil_case", name: "Civil Case", sortOrder: 0 }, {});
    await CaseStatusService.create({ organizationId: orgId, code: "pending", name: "Pending", sortOrder: 0 }, {});

    await expect(
      CaseService.create(
        { organizationId: orgId, projectId: project._id.toString(), caseName: "Bad case", caseNumber: "1", classification: "not-real", status: "pending" },
        {},
      ),
    ).rejects.toThrow();

    await expect(
      CaseService.create(
        { organizationId: orgId, projectId: project._id.toString(), caseName: "Bad case", caseNumber: "1", classification: "civil_case", status: "not-real" },
        {},
      ),
    ).rejects.toThrow();
  });

  it("fully updates a case, including its status", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-case-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const project = await seedProject(organization._id, "C");
    const created = await CaseService.create(
      { organizationId: orgId, projectId: project._id.toString(), caseName: "Case", caseNumber: "1", classification: "civil_case", status: "pending" },
      {},
    );

    const updated = await CaseService.update(
      created._id.toString(),
      orgId,
      {
        projectId: project._id.toString(),
        caseName: "Case (amended)",
        caseNumber: "1-A",
        classification: "civil_case",
        status: "dismissed",
        legalCounsel: "Atty. Dela Cruz",
      },
      {},
    );

    expect(updated.status).toBe("dismissed");
    expect(updated.caseName).toBe("Case (amended)");
    expect(updated.legalCounsel).toBe("Atty. Dela Cruz");
  });

  it("lists cases for an organization, most recently created first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-case-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const project = await seedProject(organization._id, "D");
    await CaseService.create(
      { organizationId: orgId, projectId: project._id.toString(), caseName: "Case A", caseNumber: "1", classification: "civil_case", status: "pending" },
      {},
    );
    await CaseService.create(
      { organizationId: orgId, projectId: project._id.toString(), caseName: "Case B", caseNumber: "2", classification: "civil_case", status: "pending" },
      {},
    );

    const cases = await CaseService.listCurrent(orgId);
    expect(cases).toHaveLength(2);
  });
});
