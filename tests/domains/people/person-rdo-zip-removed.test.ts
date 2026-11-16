import { describe, it, expect } from "vitest";
import { PersonModel } from "@/server/db/models";
import { updateEmployeeProfileSchema } from "@/shared/validation/workforce";

// HR removed the employee RDO and ZIP code fields (they are not part of the employee information the system keeps).
describe("employee RDO and ZIP code are gone", () => {
  it("the Person model has neither field", () => {
    expect(PersonModel.schema.path("rdoCode")).toBeUndefined();
    expect(PersonModel.schema.path("zipCode")).toBeUndefined();
  });

  it("the profile edit schema drops them if a client still sends them", () => {
    const parsed = updateEmployeeProfileSchema.parse({ organizationId: "6650f0c2a1b2c3d4e5f60718", firstName: "Ana", lastName: "Cruz", rdoCode: "039", zipCode: "1100" });
    expect(parsed).not.toHaveProperty("rdoCode");
    expect(parsed).not.toHaveProperty("zipCode");
  });
});
