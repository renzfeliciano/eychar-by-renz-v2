import { describe, it, expect } from "vitest";
import { REMARKS_MAX_LENGTH, remarksSchema } from "@/shared/validation/shared";
import { hireEmployeeSchema, updateEmployeeProfileSchema } from "@/shared/validation/workforce";

const organizationId = "a".repeat(24);
const hire = { organizationId, firstName: "Jane", lastName: "Doe", employmentType: "regular" };
const edit = { organizationId, firstName: "Jane", lastName: "Doe" };
const tooLong = "x".repeat(REMARKS_MAX_LENGTH + 1);

describe("employee remarks validation", () => {
  it("trims, and allows exactly the maximum length", () => {
    expect(remarksSchema.parse("  Senior, PWD  ")).toBe("Senior, PWD");
    expect(remarksSchema.safeParse("x".repeat(REMARKS_MAX_LENGTH)).success).toBe(true);
  });

  it("rejects an over-long note with a readable message", () => {
    const result = remarksSchema.safeParse(tooLong);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(`Remarks can be at most ${REMARKS_MAX_LENGTH} characters`);
  });

  it("is optional when hiring, and a blank note is treated as no note", () => {
    expect(hireEmployeeSchema.parse(hire).remarks).toBeUndefined();
    expect(hireEmployeeSchema.parse({ ...hire, remarks: "   " }).remarks).toBeUndefined();
    expect(hireEmployeeSchema.parse({ ...hire, remarks: "Senior, PWD" }).remarks).toBe("Senior, PWD");
    expect(hireEmployeeSchema.safeParse({ ...hire, remarks: tooLong }).success).toBe(false);
  });

  it("keeps the empty string on edit, which is how the form clears the note", () => {
    expect(updateEmployeeProfileSchema.parse({ ...edit, remarks: "" }).remarks).toBe("");
    expect(updateEmployeeProfileSchema.parse(edit).remarks).toBeUndefined();
    expect(updateEmployeeProfileSchema.safeParse({ ...edit, remarks: tooLong }).success).toBe(false);
  });
});
