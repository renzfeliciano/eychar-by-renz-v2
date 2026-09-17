import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { AssetIssuanceService } from "@/domains/assets/asset-issuance-service";
import { NotFoundError } from "@/shared/errors";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("AssetIssuanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("logs an asset issued to an employee", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ai-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "A");

    const record = await AssetIssuanceService.create(
      employee._id.toString(),
      { organizationId: orgId, assetName: "Dell Latitude 5420", assetType: "Laptop", condition: "Good", issuedDate: new Date("2026-01-10") },
      {},
    );

    expect(record.assetName).toBe("Dell Latitude 5420");
    expect(record.condition).toBe("Good");
  });

  it("rejects an employee id that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ai-bad-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-ai-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignEmployee = await seedEmployee(otherOrg._id, "FOREIGN");

    await expect(
      AssetIssuanceService.create(
        foreignEmployee._id.toString(),
        { organizationId: orgId, assetName: "Laptop", condition: "Good", issuedDate: new Date("2026-01-10") },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a return date before the issued date", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ai-dates-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "B");

    await expect(
      AssetIssuanceService.create(
        employee._id.toString(),
        { organizationId: orgId, assetName: "Laptop", condition: "Good", issuedDate: new Date("2026-01-10"), returnedDate: new Date("2026-01-01") },
        {},
      ),
    ).rejects.toThrow();
  });

  it("fully updates an asset issuance record, including marking it returned", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ai-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "C");
    const record = await AssetIssuanceService.create(
      employee._id.toString(),
      { organizationId: orgId, assetName: "Laptop", condition: "Good", issuedDate: new Date("2026-01-10") },
      {},
    );

    const updated = await AssetIssuanceService.update(
      record._id.toString(),
      orgId,
      { assetName: "Laptop", condition: "Fair", issuedDate: new Date("2026-01-10"), returnedDate: new Date("2026-06-01"), remarks: "Minor scratch" },
      {},
    );

    expect(updated.condition).toBe("Fair");
    expect(updated.remarks).toBe("Minor scratch");
    expect(updated.returnedDate).toBeTruthy();
  });

  it("lists asset issuance records for an employee, most recently issued first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ai-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "D");
    await AssetIssuanceService.create(
      employee._id.toString(),
      { organizationId: orgId, assetName: "Old laptop", condition: "Fair", issuedDate: new Date("2024-01-10") },
      {},
    );
    await AssetIssuanceService.create(
      employee._id.toString(),
      { organizationId: orgId, assetName: "New laptop", condition: "Good", issuedDate: new Date("2026-01-10") },
      {},
    );

    const records = await AssetIssuanceService.listForEmployee(employee._id.toString(), orgId);
    expect(records).toHaveLength(2);
    expect(records[0].assetName).toBe("New laptop");
  });
});
