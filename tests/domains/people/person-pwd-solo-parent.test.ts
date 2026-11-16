import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { PersonService } from "@/domains/people/person-service";
import { updateEmployeeProfileSchema } from "@/shared/validation/workforce";

const baseEdit = { organizationId: "6650f0c2a1b2c3d4e5f60718", firstName: "Ana", lastName: "Cruz" };

describe("PWD and Solo Parent IDs on the person", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), PersonModel.deleteMany({}), AuditLogModel.deleteMany({})]);
  });

  async function seedPerson() {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pwd-${Date.now()}-${Math.random()}` });
    const organizationId = organization._id.toString();
    const person = await PersonService.create({ organizationId, firstName: "Ana", lastName: "Cruz" }, {});
    return { organizationId, personId: person._id.toString() };
  }

  it("sets the number and validity date of each ID", async () => {
    const { organizationId, personId } = await seedPerson();
    const updated = await PersonService.update(personId, organizationId, { pwdIdNumber: "PWD-12345", pwdIdValidUntil: new Date("2027-05-31"), soloParentIdNumber: "SP-777", soloParentIdValidUntil: new Date("2027-01-15") }, {});
    expect(updated.pwdIdNumber).toBe("PWD-12345");
    expect(updated.pwdIdValidUntil?.toISOString().slice(0, 10)).toBe("2027-05-31");
    expect(updated.soloParentIdNumber).toBe("SP-777");
    expect(updated.soloParentIdValidUntil?.toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("clears each field when sent as an empty string, so no key is left behind", async () => {
    const { organizationId, personId } = await seedPerson();
    await PersonService.update(personId, organizationId, { pwdIdNumber: "PWD-1", pwdIdValidUntil: new Date("2027-05-31"), soloParentIdNumber: "SP-1", soloParentIdValidUntil: new Date("2027-01-15") }, {});
    await PersonService.update(personId, organizationId, { pwdIdNumber: "", pwdIdValidUntil: "", soloParentIdNumber: "", soloParentIdValidUntil: "" }, {});
    const stored = await PersonModel.collection.findOne({ _id: (await PersonModel.findOne({}))!._id });
    for (const key of ["pwdIdNumber", "pwdIdValidUntil", "soloParentIdNumber", "soloParentIdValidUntil"]) expect(stored).not.toHaveProperty(key);
  });

  it("records the old and new values in the audit entry", async () => {
    const { organizationId, personId } = await seedPerson();
    await PersonService.update(personId, organizationId, { pwdIdNumber: "PWD-1" }, {});
    await PersonService.update(personId, organizationId, { pwdIdNumber: "PWD-2" }, {});
    const entries = await AuditLogModel.find({ action: "person.updated" }).sort({ createdAt: 1 }).lean();
    expect(entries[1].before).toMatchObject({ pwdIdNumber: "PWD-1" });
    expect(entries[1].after).toMatchObject({ pwdIdNumber: "PWD-2" });
  });
});

describe("profile edit schema: PWD and Solo Parent", () => {
  it("accepts numbers, dates and empty strings (clear)", () => {
    expect(updateEmployeeProfileSchema.parse({ ...baseEdit, pwdIdNumber: " PWD-1 ", pwdIdValidUntil: "2027-05-31", soloParentIdNumber: "SP-1", soloParentIdValidUntil: "2027-01-15" })).toMatchObject({ pwdIdNumber: "PWD-1", soloParentIdNumber: "SP-1" });
    expect(updateEmployeeProfileSchema.parse({ ...baseEdit, pwdIdNumber: "", pwdIdValidUntil: "", soloParentIdNumber: "", soloParentIdValidUntil: "" })).toMatchObject({ pwdIdNumber: "", pwdIdValidUntil: "" });
  });

  it("refuses a number over 50 characters and a date that is not a date", () => {
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdNumber: "9".repeat(51) }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, soloParentIdNumber: "9".repeat(51) }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdValidUntil: "soon" }).success).toBe(false);
  });
});

describe("profile edit schema: validity dates are real calendar days", () => {
  it("turns a YYYY-MM-DD day into UTC midnight of that day", () => {
    const parsed = updateEmployeeProfileSchema.parse({ ...baseEdit, pwdIdValidUntil: "2027-05-31" });
    expect(parsed.pwdIdValidUntil).toEqual(new Date("2027-05-31T00:00:00Z"));
  });

  it("refuses null (which would have become 1970-01-01), a day that does not exist, and free-form dates", () => {
    for (const bad of [null, "2027-02-30", "May 31 2027", "2027/05/31", "31-05-2027"]) {
      expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdValidUntil: bad }).success).toBe(false);
      expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, soloParentIdValidUntil: bad }).success).toBe(false);
    }
  });
});

describe("profile edit schema: a validity date needs its ID number", () => {
  it("refuses a date with the number cleared, on the number's field, for each ID", () => {
    const pwd = updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdNumber: "", pwdIdValidUntil: "2027-05-31" });
    expect(pwd.success).toBe(false);
    expect(pwd.error?.issues.some((issue) => issue.path[0] === "pwdIdNumber")).toBe(true);
    const solo = updateEmployeeProfileSchema.safeParse({ ...baseEdit, soloParentIdNumber: "", soloParentIdValidUntil: "2027-01-15" });
    expect(solo.success).toBe(false);
    expect(solo.error?.issues.some((issue) => issue.path[0] === "soloParentIdNumber")).toBe(true);
  });

  it("accepts number and date together, the number alone, and both cleared", () => {
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdNumber: "PWD-1", pwdIdValidUntil: "2027-05-31" }).success).toBe(true);
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdNumber: "PWD-1", pwdIdValidUntil: "" }).success).toBe(true);
    expect(updateEmployeeProfileSchema.safeParse({ ...baseEdit, pwdIdNumber: "", pwdIdValidUntil: "" }).success).toBe(true);
  });
});
