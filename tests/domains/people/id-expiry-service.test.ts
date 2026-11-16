import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, GovernmentIdRecordModel, GovernmentIdTypeModel, OrganizationModel, PersonModel, PrcProfessionModel, ProfessionalLicenseRecordModel } from "@/server/db/models";
import { IdExpiryService } from "@/domains/people/id-expiry-service";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const until = new Date("2026-12-16T23:59:59Z");

async function seedOrg() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-idexp-${unique()}` });
  await GovernmentIdTypeModel.create({ organizationId: organization._id, code: "passport", name: "Passport", sortOrder: 1 });
  await PrcProfessionModel.create({ organizationId: organization._id, code: "nurse", name: "Nurse", sortOrder: 1 });
  return organization._id as Types.ObjectId;
}

async function seedEmployee(organizationId: Types.ObjectId, personExtra: Record<string, unknown> = {}) {
  const person = await PersonModel.create({ organizationId, firstName: "Ana", lastName: "Cruz", ...personExtra });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `E-${unique()}` });
  return { personId: person._id as Types.ObjectId, employeeId: employee._id.toString() };
}

const keyed = (items: { label: string; validKey: string; employeeId: string }[]) => items.map((item) => `${item.label}|${item.validKey}`).sort();

describe("IdExpiryService.listExpiring", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("gathers PWD, Solo Parent, government ID and PRC license dates on or before the cut-off, with readable labels", async () => {
    const organizationId = await seedOrg();
    const { personId, employeeId } = await seedEmployee(organizationId, { pwdIdValidUntil: new Date("2026-11-10"), soloParentIdValidUntil: new Date("2026-12-01") });
    await GovernmentIdRecordModel.create({ organizationId, personId, typeCode: "passport", idNumber: "P1", validUntil: new Date("2026-12-10") });
    await GovernmentIdRecordModel.create({ organizationId, personId, otherTypeName: "Seaman's Book", idNumber: "SB", validUntil: new Date("2026-11-20") });
    await ProfessionalLicenseRecordModel.create({ organizationId, personId, professionCode: "nurse", licenseNumber: "N1", validUntil: new Date("2026-12-16") });

    const items = await IdExpiryService.listExpiring(organizationId.toString(), until);

    expect(items.every((item) => item.employeeId === employeeId)).toBe(true);
    expect(keyed(items)).toEqual(
      ["PRC license (Nurse)|2026-12-16", "PWD ID|2026-11-10", "Passport|2026-12-10", "Seaman's Book|2026-11-20", "Solo Parent ID|2026-12-01"].sort(),
    );
  });

  it("leaves out dates after the cut-off, missing dates, and other organizations", async () => {
    const organizationId = await seedOrg();
    const otherOrg = await seedOrg();
    const { personId } = await seedEmployee(organizationId, { pwdIdValidUntil: new Date("2027-03-01"), soloParentIdNumber: "SP-1" });
    await GovernmentIdRecordModel.create({ organizationId, personId, typeCode: "passport", idNumber: "P1", validUntil: new Date("2026-12-17") });
    await GovernmentIdRecordModel.create({ organizationId, personId, typeCode: "passport", idNumber: "P2" });
    await ProfessionalLicenseRecordModel.create({ organizationId, personId, professionCode: "nurse", licenseNumber: "N1" });
    await seedEmployee(otherOrg, { pwdIdValidUntil: new Date("2026-11-10") });

    expect(await IdExpiryService.listExpiring(organizationId.toString(), until)).toEqual([]);
  });

  it("returns one item per employee record of a rehired person, so the dashboard can keep the active one", async () => {
    const organizationId = await seedOrg();
    const { personId, employeeId } = await seedEmployee(organizationId, { pwdIdValidUntil: new Date("2026-11-10") });
    const rehire = await EmployeeModel.create({ organizationId, personId, employeeNumber: `E-${unique()}` });

    const items = await IdExpiryService.listExpiring(organizationId.toString(), until);

    expect(items.map((item) => item.employeeId).sort()).toEqual([employeeId, rehire._id.toString()].sort());
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });

  it("uses the stored code when the catalog has no such item", async () => {
    const organizationId = await seedOrg();
    const { personId } = await seedEmployee(organizationId);
    await GovernmentIdRecordModel.create({ organizationId, personId, typeCode: "old_type", idNumber: "X", validUntil: new Date("2026-11-10") });

    const items = await IdExpiryService.listExpiring(organizationId.toString(), until);
    expect(items.map((item) => item.label)).toEqual(["old_type"]);
  });
});

describe("IdExpiryService.listExpiring: limited to given employees", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("returns only the given employees' items, so former staff's old dates can't crowd out a current employee's (the cap is per source)", async () => {
    const organizationId = await seedOrg();
    const former = await seedEmployee(organizationId);
    const current = await seedEmployee(organizationId);
    await GovernmentIdRecordModel.insertMany(
      Array.from({ length: 201 }, (_, index) => ({ organizationId, personId: former.personId, typeCode: "passport", idNumber: `OLD-${index}`, validUntil: new Date("2020-01-01") })),
    );
    await GovernmentIdRecordModel.create({ organizationId, personId: current.personId, typeCode: "passport", idNumber: "NEW-1", validUntil: new Date("2026-11-20") });

    const items = await IdExpiryService.listExpiring(organizationId.toString(), until, { employeeIds: [current.employeeId] });

    expect(items.map((item) => item.employeeId)).toEqual([current.employeeId]);
    expect(items[0].label).toBe("Passport");
  });

  it("keeps only the newest employee record of a rehired person when both are given", async () => {
    const organizationId = await seedOrg();
    const first = await seedEmployee(organizationId, { pwdIdValidUntil: new Date("2026-11-10") });
    const rehire = await EmployeeModel.create({ organizationId, personId: first.personId, employeeNumber: `E-${unique()}` });

    const items = await IdExpiryService.listExpiring(organizationId.toString(), until, { employeeIds: [first.employeeId, rehire._id.toString()] });

    expect(items.map((item) => item.employeeId)).toEqual([rehire._id.toString()]);
  });

  it("returns nothing for an empty list of employees", async () => {
    const organizationId = await seedOrg();
    await seedEmployee(organizationId, { pwdIdValidUntil: new Date("2026-11-10") });
    expect(await IdExpiryService.listExpiring(organizationId.toString(), until, { employeeIds: [] })).toEqual([]);
  });
});

describe("indexes behind the dashboard's expiry query", () => {
  const hasIndex = (model: { schema: { indexes: () => unknown[] } }, keys: Record<string, number>) =>
    (model.schema.indexes() as [Record<string, unknown>, unknown][]).some(([fields]) => JSON.stringify(fields) === JSON.stringify(keys));

  it("are declared on the person's dates and on both record types", () => {
    expect(hasIndex(PersonModel, { organizationId: 1, pwdIdValidUntil: 1 })).toBe(true);
    expect(hasIndex(PersonModel, { organizationId: 1, soloParentIdValidUntil: 1 })).toBe(true);
    expect(hasIndex(GovernmentIdRecordModel, { organizationId: 1, validUntil: 1 })).toBe(true);
    expect(hasIndex(ProfessionalLicenseRecordModel, { organizationId: 1, validUntil: 1 })).toBe(true);
  });
});
