import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel } from "@/server/db/models";
import { PersonService } from "@/domains/people/person-service";

describe("PersonService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), PersonModel.deleteMany({})]);
  });

  it("creates a person scoped to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-person-1" });

    const person = await PersonService.create(
      { organizationId: organization._id.toString(), firstName: "Jane", lastName: "Doe" },
      {},
    );

    expect(person.firstName).toBe("Jane");
    const found = await PersonModel.findById(person._id).lean();
    expect(found?.organizationId.toString()).toBe(organization._id.toString());
  });
});
