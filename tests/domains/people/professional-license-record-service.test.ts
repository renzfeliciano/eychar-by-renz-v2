import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, OrganizationModel, PersonModel, ProfessionalLicenseRecordModel } from "@/server/db/models";
import { ProfessionalLicenseRecordService, toProfessionalLicenseRecordView } from "@/domains/people/professional-license-record-service";
import { PrcProfessionService } from "@/domains/catalog/prc-profession-service";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-prc-rec-${unique()}` });
  const organizationId = organization._id.toString();
  for (const [code, name, sortOrder] of [["civil_engineer", "Civil Engineer", 0], ["nurse", "Nurse", 1], ["teacher", "Professional Teacher", 2]] as const) {
    await PrcProfessionService.create({ organizationId, code, name, sortOrder }, {});
  }
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `E-${unique()}` });
  return { organizationId, employeeId: employee._id.toString() };
}

describe("ProfessionalLicenseRecordService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates licenses and lists them in profession catalog order, then by number", async () => {
    const { organizationId, employeeId } = await seed();
    await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "teacher", licenseNumber: "T-2" }, {});
    await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "civil_engineer", licenseNumber: "CE-9", validUntil: "2028-04-30" }, {});
    await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "civil_engineer", licenseNumber: "CE-1" }, {});

    const rows = await ProfessionalLicenseRecordService.listForEmployee(employeeId, organizationId);

    expect(rows.map((row) => row.licenseNumber)).toEqual(["CE-1", "CE-9", "T-2"]);
    expect(toProfessionalLicenseRecordView(rows[1])).toEqual({ id: expect.any(String), professionCode: "civil_engineer", licenseNumber: "CE-9", validUntil: "2028-04-30" });
    expect(toProfessionalLicenseRecordView(rows[0]).validUntil).toBeNull();
  });

  it("allows two licenses of one profession for one employee", async () => {
    const { organizationId, employeeId } = await seed();
    await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-1", validUntil: "2024-01-01" }, {});
    await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-2", validUntil: "2034-01-01" }, {});
    expect(await ProfessionalLicenseRecordService.listForEmployee(employeeId, organizationId)).toHaveLength(2);
  });

  it("refuses a missing profession, a blank or overlong number, a bad date, and a profession not in the catalog", async () => {
    const { organizationId, employeeId } = await seed();
    const make = (extra: Record<string, unknown>) => ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-1", ...extra } as never, {});

    await expect(make({ professionCode: "" })).rejects.toThrow(ValidationError);
    await expect(make({ licenseNumber: "  " })).rejects.toThrow(ValidationError);
    await expect(make({ licenseNumber: "9".repeat(51) })).rejects.toThrow(ValidationError);
    for (const bad of ["2026-13-40", "soon", "2026-02-30"]) await expect(make({ validUntil: bad })).rejects.toThrow(ValidationError);
    await expect(make({ professionCode: "wizard" })).rejects.toThrow(BusinessRuleError);
    expect(await ProfessionalLicenseRecordService.listForEmployee(employeeId, organizationId)).toEqual([]);
  });

  it("stores no validity date when blank, and clears one with null", async () => {
    const { organizationId, employeeId } = await seed();
    const created = await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: " N-1 ", validUntil: "" }, {});
    expect(created.licenseNumber).toBe("N-1");
    expect(await ProfessionalLicenseRecordModel.findById(created._id).lean()).not.toHaveProperty("validUntil");

    const dated = await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-2", validUntil: "2030-01-01" }, {});
    await ProfessionalLicenseRecordService.update(employeeId, dated._id.toString(), organizationId, { validUntil: null }, {});
    expect(await ProfessionalLicenseRecordModel.findById(dated._id).lean()).not.toHaveProperty("validUntil");
  });

  it("changes the number on a license whose profession was retired, but refuses switching to a retired profession", async () => {
    const { organizationId, employeeId } = await seed();
    const record = await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "teacher", licenseNumber: "T-1" }, {});
    const teacher = await PrcProfessionService.getByCode(organizationId, "teacher");
    await PrcProfessionService.updateStatus(teacher!._id.toString(), organizationId, { status: "inactive" }, {});

    const updated = await ProfessionalLicenseRecordService.update(employeeId, record._id.toString(), organizationId, { professionCode: "teacher", licenseNumber: "T-2" }, {});
    expect(updated).toMatchObject({ professionCode: "teacher", licenseNumber: "T-2" });

    const other = await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-1" }, {});
    await expect(ProfessionalLicenseRecordService.update(employeeId, other._id.toString(), organizationId, { professionCode: "teacher" }, {})).rejects.toThrow(BusinessRuleError);
  });

  it("removes a license and audits each action with before and after", async () => {
    const { organizationId, employeeId } = await seed();
    const record = await ProfessionalLicenseRecordService.create({ organizationId, employeeId, professionCode: "nurse", licenseNumber: "N-1" }, {});
    const id = record._id.toString();
    await ProfessionalLicenseRecordService.update(employeeId, id, organizationId, { licenseNumber: "N-2" }, {});
    await ProfessionalLicenseRecordService.remove(employeeId, id, organizationId, {});

    expect(await ProfessionalLicenseRecordModel.findById(id)).toBeNull();
    const audit = await AuditLogModel.find({ resourceId: record._id }).sort({ createdAt: 1 }).lean();
    expect(audit.map((entry) => entry.action)).toEqual(["professional-license-record.created", "professional-license-record.updated", "professional-license-record.removed"]);
    expect(audit[1].before).toMatchObject({ licenseNumber: "N-1" });
    expect(audit[1].after).toMatchObject({ licenseNumber: "N-2" });
  });

  it("reads another organization's employee, and another employee's license, as not found", async () => {
    const a = await seed();
    const b = await seed();
    const colleagueEmployee = await EmployeeModel.create({
      organizationId: new Types.ObjectId(a.organizationId),
      personId: (await PersonModel.create({ organizationId: new Types.ObjectId(a.organizationId), firstName: "Sam", lastName: "Roe" }))._id,
      employeeNumber: `E-${unique()}`,
    });
    const record = await ProfessionalLicenseRecordService.create({ organizationId: a.organizationId, employeeId: a.employeeId, professionCode: "nurse", licenseNumber: "N-1" }, {});
    const id = record._id.toString();

    await expect(ProfessionalLicenseRecordService.listForEmployee(b.employeeId, a.organizationId)).rejects.toThrow(NotFoundError);
    await expect(ProfessionalLicenseRecordService.create({ organizationId: a.organizationId, employeeId: b.employeeId, professionCode: "nurse", licenseNumber: "N-9" }, {})).rejects.toThrow(NotFoundError);
    await expect(ProfessionalLicenseRecordService.update(colleagueEmployee._id.toString(), id, a.organizationId, { licenseNumber: "X" }, {})).rejects.toThrow(NotFoundError);
    await expect(ProfessionalLicenseRecordService.remove(colleagueEmployee._id.toString(), id, a.organizationId, {})).rejects.toThrow(NotFoundError);
    await expect(ProfessionalLicenseRecordService.update(a.employeeId, id, b.organizationId, { licenseNumber: "X" }, {})).rejects.toThrow(NotFoundError);
  });
});
