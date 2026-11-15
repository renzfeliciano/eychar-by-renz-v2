import { describe, it, expect } from "vitest";
import { toRosterApiRow } from "@/domains/workforce/roster-api-view";

describe("toRosterApiRow", () => {
  it("keeps the name and work email and drops statutory IDs, birth date, address, phone and remarks", () => {
    const row = toRosterApiRow({
      employeeNumber: "E-001",
      person: {
        firstName: "Ana",
        middleName: "B",
        lastName: "Cruz",
        email: "ana@example.com",
        phone: "0917 000 0000",
        birthDate: new Date("1990-01-01"),
        address: "12 Rizal St",
        remarks: "On a performance plan",
        sssNumber: "33-1234567-8",
        philHealthNumber: "12-345678901-2",
        pagIbigNumber: "1234-5678-9012",
        tinNumber: "123-456-789-000",
      },
    });

    expect(row.employeeNumber).toBe("E-001");
    expect(row.person).toEqual({ firstName: "Ana", middleName: "B", lastName: "Cruz", email: "ana@example.com" });
    expect(JSON.stringify(row)).not.toMatch(/33-1234567|123-456-789|1990|Rizal|performance plan|0917/);
  });

  it("passes a missing person through as null", () => {
    expect(toRosterApiRow({ employeeNumber: "E-002", person: null }).person).toBeNull();
  });
});
