import { describe, it, expect } from "vitest";
import { hireEmployeeSchema, updateEmployeeProfileSchema } from "@/shared/validation/workforce";

const organizationId = "507f1f77bcf86cd799439011";
const hire = { organizationId, firstName: "Jane", lastName: "Doe", employmentType: "regular" };
const profile = { organizationId, firstName: "Jane", lastName: "Doe" };

// Which codes exist is catalog data, checked by PersonService against the organization's Civil statuses catalog.
describe("civil status validation", () => {
  it("accepts a catalog code on hire and on edit", () => {
    expect(hireEmployeeSchema.parse({ ...hire, civilStatusCode: "married" }).civilStatusCode).toBe("married");
    expect(updateEmployeeProfileSchema.parse({ ...profile, civilStatusCode: "solo_parent" }).civilStatusCode).toBe("solo_parent");
  });

  it("refuses an over-long code", () => {
    expect(hireEmployeeSchema.safeParse({ ...hire, civilStatusCode: "x".repeat(201) }).success).toBe(false);
  });

  it("treats blank as none on hire, and as clear on edit", () => {
    expect(hireEmployeeSchema.parse({ ...hire, civilStatusCode: "" }).civilStatusCode).toBeUndefined();
    expect(updateEmployeeProfileSchema.parse({ ...profile, civilStatusCode: "" }).civilStatusCode).toBe("");
  });
});
