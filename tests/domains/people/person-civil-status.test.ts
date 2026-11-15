import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, PersonModel } from "@/server/db/models";
import { PersonService } from "@/domains/people/person-service";
import { CivilStatusService } from "@/domains/catalog/civil-status-service";
import { BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-pcs-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  await CivilStatusService.create({ organizationId, code: "single", name: "Single", sortOrder: 0 }, {});
  await CivilStatusService.create({ organizationId, code: "married", name: "Married", sortOrder: 1 }, {});
  return organizationId;
}

describe("a person's civil status", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is stored as the catalog code, replaced, and cleared", async () => {
    const organizationId = await seedOrganization("crud");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", civilStatusCode: "single" }, {});
    expect(person.civilStatusCode).toBe("single");

    const replaced = await PersonService.update(person._id.toString(), organizationId, { civilStatusCode: "married" }, {});
    expect(replaced.civilStatusCode).toBe("married");

    const cleared = await PersonService.update(person._id.toString(), organizationId, { civilStatusCode: "" }, {});
    expect(cleared.civilStatusCode).toBeUndefined();
  });

  it("records what it was and what it became in the audit entry", async () => {
    const organizationId = await seedOrganization("audit");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", civilStatusCode: "single" }, {});
    await PersonService.update(person._id.toString(), organizationId, { civilStatusCode: "married" }, {});

    const audit = await AuditLogModel.findOne({ resourceId: person._id, action: "person.updated" }).lean();
    expect(audit?.before).toMatchObject({ civilStatusCode: "single" });
    expect(audit?.after).toMatchObject({ civilStatusCode: "married" });
  });

  it("must be a status in the organization's catalog", async () => {
    const organizationId = await seedOrganization("catalog");
    await expect(PersonService.create({ organizationId, firstName: "Bad", lastName: "Status", civilStatusCode: "complicated" }, {})).rejects.toThrow(BusinessRuleError);

    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe" }, {});
    await expect(PersonService.update(person._id.toString(), organizationId, { civilStatusCode: "complicated" }, {})).rejects.toThrow(BusinessRuleError);
    expect((await PersonModel.findById(person._id).lean())?.civilStatusCode).toBeUndefined();
  });

  it("can't be newly chosen once retired, but a person who has it keeps it through other edits", async () => {
    const organizationId = await seedOrganization("retired");
    const person = await PersonService.create({ organizationId, firstName: "Jane", lastName: "Doe", civilStatusCode: "married" }, {});
    const item = await CivilStatusService.getByCode(organizationId, "married");
    await CivilStatusService.updateStatus(item!._id.toString(), organizationId, { status: "inactive" }, {});

    await expect(PersonService.create({ organizationId, firstName: "New", lastName: "Hire", civilStatusCode: "married" }, {})).rejects.toThrow(BusinessRuleError);
    const updated = await PersonService.update(person._id.toString(), organizationId, { civilStatusCode: "married", remarks: "Updated" }, {});
    expect(updated.civilStatusCode).toBe("married");
  });
});
