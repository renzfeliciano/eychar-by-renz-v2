import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EducationRecordModel, EmployeeModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { EducationRecordService } from "@/domains/people/education-record-service";
import { EducationLevelService } from "@/domains/catalog/education-level-service";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { localDateKey } from "@/lib/date-key";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nextYear = Number(localDateKey().slice(0, 4)) + 1;

async function seed(withCatalog = true) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-edurec-${unique()}` });
  const organizationId = organization._id.toString();
  if (withCatalog) {
    for (const [code, name, sortOrder] of [["high_school_graduate", "High School Graduate", 1], ["bachelors_degree", "Bachelor’s Degree", 6], ["masters_degree", "Master’s Degree", 8]] as const) {
      await EducationLevelService.create({ organizationId, code, name, sortOrder }, {});
    }
  }
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `E-${unique()}` });
  return { organizationId, employeeId: employee._id.toString(), personId: person._id.toString() };
}

describe("EducationRecordService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates and lists entries by level order, then year, with blank years last", async () => {
    const { organizationId, employeeId } = await seed();
    await EducationRecordService.create({ organizationId, employeeId, levelCode: "masters_degree", school: "UP Diliman", course: "MBA", yearGraduated: 2020 }, {});
    await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy" }, {});
    await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "Ateneo", course: "BS Management", yearGraduated: 2014 }, {});
    await EducationRecordService.create({ organizationId, employeeId, levelCode: "high_school_graduate", school: "Rizal High", yearGraduated: 2009 }, {});

    const rows = await EducationRecordService.listForEmployee(employeeId, organizationId);

    expect(rows.map((row) => row.school)).toEqual(["Rizal High", "Ateneo", "PUP", "UP Diliman"]);
  });

  it("stores a blank course and a blank year as absent, never as empty values", async () => {
    const { organizationId, employeeId } = await seed();
    const created = await EducationRecordService.create({ organizationId, employeeId, levelCode: "high_school_graduate", school: "  Rizal High  ", course: "   " }, {});

    expect(created.school).toBe("Rizal High");
    const stored = await EducationRecordModel.findById(created._id).lean();
    expect(stored).not.toHaveProperty("course");
    expect(stored).not.toHaveProperty("yearGraduated");
  });

  it("refuses a missing school and an unknown level once the catalog is set up", async () => {
    const { organizationId, employeeId } = await seed();
    await expect(EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "   " }, {})).rejects.toThrow(ValidationError);
    await expect(EducationRecordService.create({ organizationId, employeeId, levelCode: "wizard", school: "Hogwarts" }, {})).rejects.toThrow(BusinessRuleError);
    expect(await EducationRecordService.listForEmployee(employeeId, organizationId)).toEqual([]);
  });

  it("refuses a year before 1900, after next year, a fraction, or text, and allows the boundaries", async () => {
    const { organizationId, employeeId } = await seed();
    const make = (yearGraduated: unknown) =>
      EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP", yearGraduated: yearGraduated as number }, {});

    for (const bad of [0, 1899, nextYear + 1, 2001.5, "abc", Number.NaN]) await expect(make(bad)).rejects.toThrow(ValidationError);
    await expect(make(1900)).resolves.toBeDefined();
    await expect(make(nextYear)).resolves.toBeDefined();
  });

  it("changes the school on an entry whose level was retired, but refuses switching to a retired level", async () => {
    const { organizationId, employeeId } = await seed();
    const old = await EducationRecordService.create({ organizationId, employeeId, levelCode: "masters_degree", school: "UP" }, {});
    const other = await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP" }, {});
    const level = await EducationLevelService.getByCode(organizationId, "masters_degree");
    await EducationLevelService.updateStatus(level!._id.toString(), organizationId, { status: "inactive" }, {});

    const renamed = await EducationRecordService.update(employeeId, old._id.toString(), organizationId, { school: "UP Diliman" }, {});
    expect(renamed.school).toBe("UP Diliman");
    expect(renamed.levelCode).toBe("masters_degree");
    await expect(EducationRecordService.update(employeeId, other._id.toString(), organizationId, { levelCode: "masters_degree" }, {})).rejects.toThrow(BusinessRuleError);
  });

  it("clears the course and the year, and audits before and after", async () => {
    const { organizationId, employeeId } = await seed();
    const created = await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: 2014 }, {});

    const cleared = await EducationRecordService.update(employeeId, created._id.toString(), organizationId, { course: "", yearGraduated: null }, {});

    expect(cleared.course).toBeUndefined();
    expect(cleared.yearGraduated).toBeUndefined();
    const audit = await AuditLogModel.findOne({ resourceId: created._id, action: "education-record.updated" }).lean();
    expect(audit?.before).toMatchObject({ course: "BS Accountancy", yearGraduated: 2014 });
    expect(audit?.after).not.toHaveProperty("course", "BS Accountancy");
  });

  it("removes an entry and audits it", async () => {
    const { organizationId, employeeId } = await seed();
    const created = await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP" }, {});
    const createdAudit = await AuditLogModel.findOne({ resourceId: created._id, action: "education-record.created" }).lean();
    expect(createdAudit?.after).toMatchObject({ school: "PUP", levelCode: "bachelors_degree" });

    await EducationRecordService.remove(employeeId, created._id.toString(), organizationId, {});

    expect(await EducationRecordModel.findById(created._id)).toBeNull();
    const removedAudit = await AuditLogModel.findOne({ resourceId: created._id, action: "education-record.removed" }).lean();
    expect(removedAudit?.before).toMatchObject({ school: "PUP" });
  });

  it("refuses another person's entry in the same organization, through the wrong employee", async () => {
    const { organizationId, employeeId } = await seed();
    const person2 = await PersonModel.create({ organizationId: new Types.ObjectId(organizationId), firstName: "Other", lastName: "Person" });
    const employee2 = await EmployeeModel.create({ organizationId: new Types.ObjectId(organizationId), personId: person2._id, employeeNumber: `E-${unique()}` });
    const entry = await EducationRecordService.create({ organizationId, employeeId, levelCode: "bachelors_degree", school: "PUP" }, {});

    await expect(EducationRecordService.remove(employee2._id.toString(), entry._id.toString(), organizationId, {})).rejects.toThrow(NotFoundError);
    await expect(EducationRecordService.update(employee2._id.toString(), entry._id.toString(), organizationId, { school: "X" }, {})).rejects.toThrow(NotFoundError);
    expect(await EducationRecordModel.findById(entry._id)).not.toBeNull();
  });

  it("reads another organization's employee and entries as not found", async () => {
    const a = await seed();
    const b = await seed();
    const entry = await EducationRecordService.create({ organizationId: a.organizationId, employeeId: a.employeeId, levelCode: "bachelors_degree", school: "PUP" }, {});

    await expect(EducationRecordService.listForEmployee(a.employeeId, b.organizationId)).rejects.toThrow(NotFoundError);
    await expect(EducationRecordService.create({ organizationId: b.organizationId, employeeId: a.employeeId, levelCode: "bachelors_degree", school: "X" }, {})).rejects.toThrow(NotFoundError);
    await expect(EducationRecordService.update(a.employeeId, entry._id.toString(), b.organizationId, { school: "X" }, {})).rejects.toThrow(NotFoundError);
    await expect(EducationRecordService.remove(a.employeeId, entry._id.toString(), b.organizationId, {})).rejects.toThrow(NotFoundError);
  });

  it("accepts any level before the catalog is set up, as the other catalogs do", async () => {
    const { organizationId, employeeId } = await seed(false);
    await expect(EducationRecordService.create({ organizationId, employeeId, levelCode: "anything", school: "PUP" }, {})).resolves.toBeDefined();
  });
});
