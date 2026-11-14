import { describe, it, expect } from "vitest";
import { hireEmployeeSchema, updateEmployeeProfileSchema } from "@/shared/validation/workforce";

const organizationId = "a".repeat(24);
const hire = { organizationId, firstName: "Jane", lastName: "Doe", employmentType: "regular" };
const edit = { organizationId, firstName: "Jane", lastName: "Doe" };

describe("educational attainment validation", () => {
  it("is optional when hiring, and a blank choice is treated as none", () => {
    expect(hireEmployeeSchema.parse(hire).educationLevelCode).toBeUndefined();
    expect(hireEmployeeSchema.parse({ ...hire, educationLevelCode: "   " }).educationLevelCode).toBeUndefined();
    expect(hireEmployeeSchema.parse({ ...hire, educationLevelCode: " masters_degree " }).educationLevelCode).toBe("masters_degree");
  });

  it("keeps the empty string on edit, which is how the form clears the choice", () => {
    expect(updateEmployeeProfileSchema.parse({ ...edit, educationLevelCode: "" }).educationLevelCode).toBe("");
    expect(updateEmployeeProfileSchema.parse(edit).educationLevelCode).toBeUndefined();
    expect(updateEmployeeProfileSchema.parse({ ...edit, educationLevelCode: "associate_degree" }).educationLevelCode).toBe("associate_degree");
  });

  it("refuses an absurdly long code before it reaches the database", () => {
    expect(hireEmployeeSchema.safeParse({ ...hire, educationLevelCode: "x".repeat(201) }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ ...edit, educationLevelCode: "x".repeat(201) }).success).toBe(false);
  });
});
