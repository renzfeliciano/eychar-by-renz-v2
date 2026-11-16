import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, GovernmentIdRecordModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { GovernmentIdRecordService, toGovernmentIdRecordView } from "@/domains/people/government-id-record-service";
import { GovernmentIdTypeService } from "@/domains/catalog/government-id-type-service";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seed(withCatalog = true) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-govid-rec-${unique()}` });
  const organizationId = organization._id.toString();
  if (withCatalog) {
    for (const [code, name, sortOrder] of [["drivers_license", "Driver's License", 0], ["passport", "Passport", 1], ["umid", "UMID", 2]] as const) {
      await GovernmentIdTypeService.create({ organizationId, code, name, sortOrder }, {});
    }
  }
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `E-${unique()}` });
  return { organizationId, employeeId: employee._id.toString(), personId: person._id.toString() };
}

describe("GovernmentIdRecordService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an ID of a catalog type and one with a typed name, and lists catalog order first, typed names last", async () => {
    const { organizationId, employeeId } = await seed();
    await GovernmentIdRecordService.create({ organizationId, employeeId, otherTypeName: "Firearms License", idNumber: "FL-1" }, {});
    await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "umid", idNumber: "0028-1234567-8" }, {});
    await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "drivers_license", idNumber: "N01-23-456789", validUntil: "2028-03-01" }, {});

    const rows = await GovernmentIdRecordService.listForEmployee(employeeId, organizationId);

    expect(rows.map((row) => row.idNumber)).toEqual(["N01-23-456789", "0028-1234567-8", "FL-1"]);
    expect(toGovernmentIdRecordView(rows[0])).toEqual({ id: expect.any(String), typeCode: "drivers_license", otherTypeName: null, idNumber: "N01-23-456789", validUntil: "2028-03-01" });
    expect(toGovernmentIdRecordView(rows[2])).toMatchObject({ typeCode: null, otherTypeName: "Firearms License", validUntil: null });
  });

  it("allows the same type twice for one employee (a renewed card, a second passport)", async () => {
    const { organizationId, employeeId } = await seed();
    await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P111", validUntil: "2024-01-01" }, {});
    await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P222", validUntil: "2034-01-01" }, {});

    expect((await GovernmentIdRecordService.listForEmployee(employeeId, organizationId)).map((row) => row.idNumber)).toEqual(["P111", "P222"]);
  });

  it("stores no validity date when it is blank", async () => {
    const { organizationId, employeeId } = await seed();
    const created = await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "  P1  ", validUntil: "" }, {});

    expect(created.idNumber).toBe("P1");
    expect(await GovernmentIdRecordModel.findById(created._id).lean()).not.toHaveProperty("validUntil");
  });

  it("refuses both or neither of type and typed name, a blank or overlong number, an overlong name and a bad date", async () => {
    const { organizationId, employeeId } = await seed();
    const make = (extra: Record<string, unknown>) => GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P1", ...extra } as never, {});

    await expect(make({ otherTypeName: "Other ID" })).rejects.toThrow(ValidationError);
    await expect(make({ typeCode: undefined })).rejects.toThrow(ValidationError);
    await expect(make({ idNumber: "   " })).rejects.toThrow(ValidationError);
    await expect(make({ idNumber: "9".repeat(51) })).rejects.toThrow(ValidationError);
    await expect(make({ typeCode: undefined, otherTypeName: "N".repeat(101) })).rejects.toThrow(ValidationError);
    for (const bad of ["2026-13-40", "soon", "2026-02-30", "2026/01/05"]) await expect(make({ validUntil: bad })).rejects.toThrow(ValidationError);
    expect(await GovernmentIdRecordService.listForEmployee(employeeId, organizationId)).toEqual([]);
  });

  it("refuses a type that is not in the catalog once the catalog is set up", async () => {
    const { organizationId, employeeId } = await seed();
    await expect(GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "library_card", idNumber: "L1" }, {})).rejects.toThrow(BusinessRuleError);
  });

  it("changes the number on an entry whose type was retired, but refuses switching to a retired type", async () => {
    const { organizationId, employeeId } = await seed();
    const record = await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "umid", idNumber: "U1" }, {});
    const umid = await GovernmentIdTypeService.getByCode(organizationId, "umid");
    await GovernmentIdTypeService.updateStatus(umid!._id.toString(), organizationId, { status: "inactive" }, {});

    const updated = await GovernmentIdRecordService.update(employeeId, record._id.toString(), organizationId, { typeCode: "umid", idNumber: "U2" }, {});
    expect(updated).toMatchObject({ typeCode: "umid", idNumber: "U2" });

    const other = await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P1" }, {});
    await expect(GovernmentIdRecordService.update(employeeId, other._id.toString(), organizationId, { typeCode: "umid" }, {})).rejects.toThrow(BusinessRuleError);
  });

  it("switches between a catalog type and a typed name, and clears the validity date with null", async () => {
    const { organizationId, employeeId } = await seed();
    const record = await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P1", validUntil: "2030-01-01" }, {});
    const id = record._id.toString();

    const toOther = await GovernmentIdRecordService.update(employeeId, id, organizationId, { otherTypeName: "Seaman's Book", validUntil: null }, {});
    expect(toOther.otherTypeName).toBe("Seaman's Book");
    const storedOther = await GovernmentIdRecordModel.findById(id).lean();
    expect(storedOther).not.toHaveProperty("typeCode");
    expect(storedOther).not.toHaveProperty("validUntil");

    const toType = await GovernmentIdRecordService.update(employeeId, id, organizationId, { typeCode: "passport" }, {});
    expect(toType.typeCode).toBe("passport");
    expect(await GovernmentIdRecordModel.findById(id).lean()).not.toHaveProperty("otherTypeName");

    await expect(GovernmentIdRecordService.update(employeeId, id, organizationId, { typeCode: "passport", otherTypeName: "X" }, {})).rejects.toThrow(ValidationError);
  });

  it("removes an entry and audits each action with before and after", async () => {
    const { organizationId, employeeId } = await seed();
    const record = await GovernmentIdRecordService.create({ organizationId, employeeId, typeCode: "passport", idNumber: "P1" }, {});
    const id = record._id.toString();
    await GovernmentIdRecordService.update(employeeId, id, organizationId, { idNumber: "P2" }, {});
    await GovernmentIdRecordService.remove(employeeId, id, organizationId, {});

    expect(await GovernmentIdRecordModel.findById(id)).toBeNull();
    const audit = await AuditLogModel.find({ resourceId: record._id }).sort({ createdAt: 1 }).lean();
    expect(audit.map((entry) => entry.action)).toEqual(["government-id-record.created", "government-id-record.updated", "government-id-record.removed"]);
    expect(audit[1].before).toMatchObject({ idNumber: "P1" });
    expect(audit[1].after).toMatchObject({ idNumber: "P2" });
    expect(audit[2].before).toMatchObject({ idNumber: "P2" });
  });

  it("reads another organization's employee, and another employee's entry, as not found", async () => {
    const a = await seed();
    const b = await seed();
    const colleague = await EmployeeModel.create({ organizationId: new Types.ObjectId(a.organizationId), personId: (await PersonModel.create({ organizationId: new Types.ObjectId(a.organizationId), firstName: "Sam", lastName: "Roe" }))._id, employeeNumber: `E-${unique()}` });
    const record = await GovernmentIdRecordService.create({ organizationId: a.organizationId, employeeId: a.employeeId, typeCode: "passport", idNumber: "P1" }, {});
    const id = record._id.toString();

    await expect(GovernmentIdRecordService.listForEmployee(b.employeeId, a.organizationId)).rejects.toThrow(NotFoundError);
    await expect(GovernmentIdRecordService.create({ organizationId: a.organizationId, employeeId: b.employeeId, typeCode: "passport", idNumber: "P9" }, {})).rejects.toThrow(NotFoundError);
    await expect(GovernmentIdRecordService.update(colleague._id.toString(), id, a.organizationId, { idNumber: "X" }, {})).rejects.toThrow(NotFoundError);
    await expect(GovernmentIdRecordService.remove(colleague._id.toString(), id, a.organizationId, {})).rejects.toThrow(NotFoundError);
    await expect(GovernmentIdRecordService.update(a.employeeId, id, b.organizationId, { idNumber: "X" }, {})).rejects.toThrow(NotFoundError);
  });
});
