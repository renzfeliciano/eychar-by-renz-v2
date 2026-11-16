import { describe, it, expect } from "vitest";
import { auditFields } from "@/app/(app)/settings/audit/audit-fields";

// The audit view reads field names as people would say them; the employee ID and license fields need their own wording.
describe("auditFields: employee IDs and licenses", () => {
  it("labels the PWD and Solo Parent fields on a person", () => {
    const fields = auditFields({ pwdIdNumber: "PWD-1", pwdIdValidUntil: "2027-05-31T00:00:00.000Z", soloParentIdNumber: "SP-1", soloParentIdValidUntil: "2027-01-15T00:00:00.000Z" });
    expect(fields.map((field) => field.label)).toEqual(["PWD ID number", "PWD ID valid until", "Solo Parent ID number", "Solo Parent ID valid until"]);
    expect(fields[1].value).toBe("May 31, 2027");
  });

  it("labels a government ID record's fields", () => {
    const fields = auditFields({ typeCode: "passport", otherTypeName: "Seaman's Book", idNumber: "P1", validUntil: "2030-06-30" });
    expect(fields.map((field) => field.label)).toEqual(["ID type", "ID type name", "ID number", "Valid until"]);
  });

  it("labels a PRC license record's fields", () => {
    const fields = auditFields({ professionCode: "nurse", licenseNumber: "0123456", validUntil: "2029-08-15" });
    expect(fields.map((field) => field.label)).toEqual(["Profession", "License number", "Valid until"]);
  });
});
