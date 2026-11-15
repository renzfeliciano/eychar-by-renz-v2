import { describe, it, expect } from "vitest";
import { hireEmployeeSchema, updateEmployeeProfileSchema } from "@/shared/validation/workforce";
import { CIVIL_STATUSES } from "@/shared/civil-status";

const organizationId = "507f1f77bcf86cd799439011";
const hire = { organizationId, firstName: "Jane", lastName: "Doe", employmentType: "regular" };

describe("civil status validation", () => {
  it("offers the Philippine civil statuses", () => {
    expect(CIVIL_STATUSES).toEqual(["Single", "Married", "Widowed", "Legally separated", "Annulled"]);
  });

  it("accepts a listed status on hire and on edit", () => {
    expect(hireEmployeeSchema.parse({ ...hire, civilStatus: "Married" }).civilStatus).toBe("Married");
    expect(updateEmployeeProfileSchema.parse({ organizationId, firstName: "Jane", lastName: "Doe", civilStatus: "Widowed" }).civilStatus).toBe("Widowed");
  });

  it("refuses anything else", () => {
    expect(hireEmployeeSchema.safeParse({ ...hire, civilStatus: "Complicated" }).success).toBe(false);
  });

  it("treats blank as none on hire, and as clear on edit", () => {
    expect(hireEmployeeSchema.parse({ ...hire, civilStatus: "" }).civilStatus).toBeUndefined();
    expect(updateEmployeeProfileSchema.parse({ organizationId, firstName: "Jane", lastName: "Doe", civilStatus: "" }).civilStatus).toBe("");
  });
});
