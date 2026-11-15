// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PEOPLE_EXPORT, type PeopleExportRow } from "@/app/(app)/people/people-export-actions";
import { PeoplePrintReport } from "@/app/(app)/people/people-print-report";

const row: PeopleExportRow = {
  employeeNumber: "E-001",
  name: "Jane Doe",
  gender: "Female",
  civilStatus: "Married",
  position: "Engineer",
  project: "HQ",
  employmentStatus: "Active",
  age: "30",
  lengthOfService: "2 yrs",
  dateHired: "2024-01-01",
  birthDate: "1996-01-01",
  contactNumber: "",
  address: "",
  remarks: "Senior",
  sssNumber: "",
  philHealthNumber: "",
  pagIbigNumber: "",
  tinNumber: "",
};

describe("the roster export", () => {
  it("has a Civil status column and no Educational attainment column", () => {
    const column = PEOPLE_EXPORT.columns.find((item) => item.header === "Civil status");
    expect(column).toBeDefined();
    expect(column!.value(row)).toBe("Married");
    expect(column!.value({ ...row, civilStatus: "" })).toBe("");
    expect(PEOPLE_EXPORT.columns.map((item) => item.header)).not.toContain("Educational attainment");
  });

  it("keeps Remarks, with Civil status next to Gender", () => {
    const headers = PEOPLE_EXPORT.columns.map((item) => item.header);
    expect(headers).toContain("Remarks");
    expect(headers.indexOf("Civil status")).toBe(headers.indexOf("Gender") + 1);
  });
});

describe("the roster print report", () => {
  it("shows each person's civil status, or a dash when there is none, and keeps Remarks", () => {
    render(<PeoplePrintReport rows={[row, { ...row, name: "No Status", employeeNumber: "E-002", civilStatus: "" }]} />);
    expect(screen.getByRole("columnheader", { name: "Civil status" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Remarks" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Educational attainment" })).toBeNull();
    expect(screen.getByText("Married")).toBeTruthy();
    const dashRow = screen.getByText("No Status").closest("tr")!;
    expect(dashRow.textContent).toContain("—");
  });
});
