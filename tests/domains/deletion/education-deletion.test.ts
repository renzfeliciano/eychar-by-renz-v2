import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EducationRecordModel, EmployeeModel, UserModel } from "@/server/db/models";
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
  await EducationRecordModel.create({ organizationId, personId: anaPerson, levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: 2014 });
  await EducationRecordModel.create({ organizationId, personId: anaPerson, levelCode: "high_school_graduate", school: "Rizal High" });
  await EducationRecordModel.create({ organizationId, personId: benPerson, levelCode: "bachelors_degree", school: "Ateneo" });
  return { organizationId, owner: owner._id.toString(), ana, anaPerson, benPerson };
}

describe("deleting an employee takes their educational background with them", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("lists the entries in the preview", async () => {
    const s = await seed();
    const preview = await DeletionService.preview("employee", s.ana, s.organizationId);
    expect(preview.summary).toEqual(expect.arrayContaining([{ label: "Educational background", count: 2 }]));
  });

  it("moves the entries to the recycle bin with the employee, leaves colleagues' entries alone, and restores them exactly", async () => {
    const s = await seed();

    const batch = await DeletionService.remove("employee", s.ana, s.organizationId, { confirm: "Ana Santos" }, { userId: s.owner });

    expect(await EducationRecordModel.countDocuments({ personId: s.anaPerson })).toBe(0);
    expect(await EducationRecordModel.countDocuments({ personId: s.benPerson })).toBe(1);

    await DeletionService.restore(batch._id.toString(), s.organizationId, { userId: s.owner });

    const restored = await EducationRecordModel.find({ personId: s.anaPerson }).lean();
    expect(restored.map((entry) => entry.school).sort()).toEqual(["PUP", "Rizal High"]);
    expect(restored.find((entry) => entry.school === "PUP")).toMatchObject({ course: "BS Accountancy", yearGraduated: 2014 });
  });
});
