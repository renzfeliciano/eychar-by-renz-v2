// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PEOPLE_EXPORT, type PeopleExportRow } from "@/app/(app)/people/people-export-actions";
import { PeoplePrintReport } from "@/app/(app)/people/people-print-report";

const row: PeopleExportRow = {
  employeeNumber: "E-001",
  name: "Jane Doe",
  gender: "Female",
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
  educationLevel: "Master’s Degree",
  sssNumber: "",
  philHealthNumber: "",
  pagIbigNumber: "",
  tinNumber: "",
};

describe("the roster export", () => {
  it("has an Educational attainment column carrying the level's name", () => {
    const column = PEOPLE_EXPORT.columns.find((item) => item.header === "Educational attainment");
    expect(column).toBeDefined();
    expect(column!.value(row)).toBe("Master’s Degree");
    expect(column!.value({ ...row, educationLevel: "" })).toBe("");
  });

  it("keeps the other columns where they were", () => {
    const headers = PEOPLE_EXPORT.columns.map((item) => item.header);
    expect(headers).toContain("Remarks");
    expect(headers.indexOf("Educational attainment")).toBeGreaterThan(headers.indexOf("Birth date"));
    expect(headers.indexOf("Educational attainment")).toBeLessThan(headers.indexOf("SSS no"));
  });
});

describe("the roster print report", () => {
  it("shows each person's educational attainment, or a dash when there is none", () => {
    render(<PeoplePrintReport rows={[row, { ...row, name: "No Level", employeeNumber: "E-002", educationLevel: "" }]} />);
    expect(screen.getByRole("columnheader", { name: "Educational attainment" })).toBeTruthy();
    expect(screen.getByText("Master’s Degree")).toBeTruthy();
    const dashRow = screen.getByText("No Level").closest("tr")!;
    expect(dashRow.textContent).toContain("—");
  });
});
