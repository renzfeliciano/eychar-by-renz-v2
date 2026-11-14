import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { PersonService } from "@/domains/people/person-service";
import { HireService } from "@/domains/workforce/hire-service";
import { EducationLevelService } from "@/domains/catalog/education-level-service";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string, withLevels = true) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pedu-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  if (withLevels) {
    await EducationLevelService.create({ organizationId, code: "bachelors_degree", name: "Bachelor’s Degree", sortOrder: 6 }, {});
    await EducationLevelService.create({ organizationId, code: "masters_degree", name: "Master’s Degree", sortOrder: 8 }, {});
  }
  return organizationId;
}

describe("a person's educational attainment", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is stored, replaced and cleared like the other optional profile fields", async () => {
    const organizationId = await seedOrganization("crud");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", educationLevelCode: "bachelors_degree" }, {});
    expect(person.educationLevelCode).toBe("bachelors_degree");

    const replaced = await PersonService.update(person._id.toString(), organizationId, { educationLevelCode: "masters_degree" }, {});
    expect(replaced.educationLevelCode).toBe("masters_degree");

    // "" is the edit form's "clear it" signal: the field is removed, not stored blank.
    const cleared = await PersonService.update(person._id.toString(), organizationId, { educationLevelCode: "" }, {});
    expect(cleared.educationLevelCode).toBeUndefined();
    expect((await PersonModel.findById(person._id).lean())?.educationLevelCode).toBeUndefined();
  });

  it("is optional: a person with none stays valid", async () => {
    const organizationId = await seedOrganization("none");
    const person = await PersonService.create({ organizationId, firstName: "No", lastName: "Level" }, {});
    expect(person.educationLevelCode).toBeUndefined();
  });

  it("records what it was and what it became in the audit entry", async () => {
    const organizationId = await seedOrganization("audit");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", educationLevelCode: "bachelors_degree" }, {});
    await PersonService.update(person._id.toString(), organizationId, { educationLevelCode: "masters_degree" }, {});

    const audit = await AuditLogModel.findOne({ resourceId: person._id, action: "person.updated" }).lean();
    expect(audit?.before).toMatchObject({ educationLevelCode: "bachelors_degree" });
    expect(audit?.after).toMatchObject({ educationLevelCode: "masters_degree" });
  });

  it("must be a level in the organization's catalog once it is set up", async () => {
    const organizationId = await seedOrganization("catalog");
    await expect(PersonService.create({ organizationId, firstName: "Bad", lastName: "Level", educationLevelCode: "wizard" }, {})).rejects.toThrow(BusinessRuleError);

    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe" }, {});
    await expect(PersonService.update(person._id.toString(), organizationId, { educationLevelCode: "wizard" }, {})).rejects.toThrow(BusinessRuleError);
    expect((await PersonModel.findById(person._id).lean())?.educationLevelCode).toBeUndefined();
  });

  it("can't be newly chosen once retired, but a person who already has it keeps it", async () => {
    const organizationId = await seedOrganization("retired");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", educationLevelCode: "masters_degree" }, {});
    const level = await EducationLevelService.getByCode(organizationId, "masters_degree");
    await EducationLevelService.updateStatus(level!._id.toString(), organizationId, { status: "inactive" }, {});

    expect((await PersonModel.findById(person._id).lean())?.educationLevelCode).toBe("masters_degree");
    await expect(PersonService.create({ organizationId, firstName: "New", lastName: "Hire", educationLevelCode: "masters_degree" }, {})).rejects.toThrow(BusinessRuleError);
    // Editing something else leaves the retired level alone.
    const renamed = await PersonService.update(person._id.toString(), organizationId, { firstName: "Janet" }, {});
    expect(renamed.educationLevelCode).toBe("masters_degree");
  });

  it("lets the edit form save other changes while it re-sends a level HR has since retired", async () => {
    const organizationId = await seedOrganization("resend");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", educationLevelCode: "masters_degree" }, {});
    const level = await EducationLevelService.getByCode(organizationId, "masters_degree");
    await EducationLevelService.updateStatus(level!._id.toString(), organizationId, { status: "inactive" }, {});

    // The Edit details dialog sends every field every time, including the unchanged level.
    const updated = await PersonService.update(person._id.toString(), organizationId, { firstName: "Janet", phone: "0917-123-4567", educationLevelCode: "masters_degree" }, {});

    expect(updated.firstName).toBe("Janet");
    expect(updated.educationLevelCode).toBe("masters_degree");
    // Choosing a different retired level is still refused.
    await EducationLevelService.create({ organizationId, code: "doctoral_professional_degree", name: "Doctoral", sortOrder: 9 }, {});
    const doctoral = await EducationLevelService.getByCode(organizationId, "doctoral_professional_degree");
    await EducationLevelService.updateStatus(doctoral!._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(PersonService.update(person._id.toString(), organizationId, { educationLevelCode: "doctoral_professional_degree" }, {})).rejects.toThrow(BusinessRuleError);
  });

  it("accepts any code before the catalog is set up, as the other catalogs do", async () => {
    const organizationId = await seedOrganization("unset", false);
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", educationLevelCode: "anything" }, {});
    expect(person.educationLevelCode).toBe("anything");
  });

  it("is refused on a hire before any record is written, so a bad level leaves no orphan person", async () => {
    const organizationId = await seedOrganization("hire");
    await expect(
      HireService.hire({ organizationId, firstName: "Bad", lastName: "Hire", employmentType: "regular", educationLevelCode: "wizard" } as never, {}),
    ).rejects.toThrow(BusinessRuleError);

    expect(await PersonModel.countDocuments({ organizationId })).toBe(0);
    expect(await EmployeeModel.countDocuments({ organizationId })).toBe(0);
  });
});
