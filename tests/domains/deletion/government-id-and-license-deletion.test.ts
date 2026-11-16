import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, GovernmentIdRecordModel, ProfessionalLicenseRecordModel, UserModel } from "@/server/db/models";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { seedPayrollOrganization, seedEmployee } from "../payroll/fixtures";

async function seed() {
  const { organizationId } = await seedPayrollOrganization();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const ana = await seedEmployee(organizationId, "Ana");
  const ben = await seedEmployee(organizationId, "Ben");
  const personOf = async (employeeId: string) => (await EmployeeModel.findById(employeeId).select("personId").lean())!.personId;
  const anaPerson = await personOf(ana);
  const benPerson = await personOf(ben);
  await GovernmentIdRecordModel.create({ organizationId, personId: anaPerson, typeCode: "passport", idNumber: "P1", validUntil: new Date("2030-01-01") });
  await GovernmentIdRecordModel.create({ organizationId, personId: anaPerson, otherTypeName: "Seaman's Book", idNumber: "SB-9" });
  await GovernmentIdRecordModel.create({ organizationId, personId: benPerson, typeCode: "passport", idNumber: "P2" });
  await ProfessionalLicenseRecordModel.create({ organizationId, personId: anaPerson, professionCode: "nurse", licenseNumber: "N-1", validUntil: new Date("2029-08-15") });
  await ProfessionalLicenseRecordModel.create({ organizationId, personId: benPerson, professionCode: "nurse", licenseNumber: "N-2" });
  return { organizationId, owner: owner._id.toString(), ana, anaPerson, benPerson };
}

describe("deleting an employee takes their government IDs and PRC licenses with them", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("lists both in the preview", async () => {
    const s = await seed();
    const preview = await DeletionService.preview("employee", s.ana, s.organizationId);
    expect(preview.summary).toEqual(expect.arrayContaining([{ label: "Government IDs", count: 2 }, { label: "PRC licenses", count: 1 }]));
  });

  it("moves them to the recycle bin with the employee, leaves colleagues' alone, and restores them exactly", async () => {
    const s = await seed();

    const batch = await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });

    expect(await GovernmentIdRecordModel.countDocuments({ personId: s.anaPerson })).toBe(0);
    expect(await ProfessionalLicenseRecordModel.countDocuments({ personId: s.anaPerson })).toBe(0);
    expect(await GovernmentIdRecordModel.countDocuments({ personId: s.benPerson })).toBe(1);
    expect(await ProfessionalLicenseRecordModel.countDocuments({ personId: s.benPerson })).toBe(1);

    await DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner });

    const ids = await GovernmentIdRecordModel.find({ personId: s.anaPerson }).lean();
    expect(ids.map((entry) => entry.idNumber).sort()).toEqual(["P1", "SB-9"]);
    expect(ids.find((entry) => entry.idNumber === "SB-9")).toMatchObject({ otherTypeName: "Seaman's Book" });
    const licenses = await ProfessionalLicenseRecordModel.find({ personId: s.anaPerson }).lean();
    expect(licenses).toHaveLength(1);
    expect(licenses[0]).toMatchObject({ professionCode: "nurse", licenseNumber: "N-1" });
    expect(licenses[0].validUntil?.toISOString().slice(0, 10)).toBe("2029-08-15");
  });
});
