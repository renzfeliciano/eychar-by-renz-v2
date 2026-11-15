import { describe, it, expect } from "vitest";
import { updateEmployeeProfileSchema } from "@/shared/validation/workforce";

// RDO and ZIP codes for BIR Form 2316, editable since gaps B26.
const edit = { organizationId: "507f1f77bcf86cd799439011", firstName: "Ana", lastName: "Santos" };

describe("RDO and ZIP code validation", () => {
  it("accepts 2–3 digit RDO codes with an optional letter (upper-cased) and 4-digit ZIP codes", () => {
    expect(updateEmployeeProfileSchema.parse({ ...edit, rdoCode: "039", zipCode: "1100" })).toMatchObject({ rdoCode: "039", zipCode: "1100" });
    expect(updateEmployeeProfileSchema.parse({ ...edit, rdoCode: "21a" }).rdoCode).toBe("21A");
  });

  it("treats an empty value as 'clear it' and refuses malformed codes", () => {
    expect(updateEmployeeProfileSchema.parse({ ...edit, rdoCode: "", zipCode: "" })).toMatchObject({ rdoCode: "", zipCode: "" });
    expect(updateEmployeeProfileSchema.safeParse({ ...edit, rdoCode: "RDO39" }).success).toBe(false);
    expect(updateEmployeeProfileSchema.safeParse({ ...edit, zipCode: "11000" }).success).toBe(false);
  });
});
