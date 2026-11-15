// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EducationBackgroundCard } from "@/app/(app)/people/[id]/education-background-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const LEVELS = [
  { code: "high_school_graduate", name: "High School Graduate", status: "active", sortOrder: 1 },
  { code: "bachelors_degree", name: "Bachelor’s Degree", status: "active", sortOrder: 6 },
  { code: "masters_degree", name: "Master’s Degree", status: "inactive", sortOrder: 8 },
];
const RECORDS = [
  { id: "r1", levelCode: "high_school_graduate", school: "Rizal High", course: null, yearGraduated: 2009 },
  { id: "r2", levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: null },
  { id: "r3", levelCode: "masters_degree", school: "UP", course: "MBA", yearGraduated: 2020 },
];
const base = { organizationId: "org1", employeeId: "e1", employeeName: "Jane Doe", levels: LEVELS };

describe("EducationBackgroundCard", () => {
  it("lists each entry with the level's name, school, course and year, and a dash for blanks", () => {
    render(<EducationBackgroundCard {...base} records={RECORDS} canUpdate={false} />);

    expect(screen.getByText("Educational background")).toBeTruthy();
    const hs = screen.getByText("Rizal High").closest("tr")!;
    expect(within(hs).getByText("High School Graduate")).toBeTruthy();
    expect(within(hs).getByText("2009")).toBeTruthy();
    expect(within(hs).getAllByText("—").length).toBeGreaterThan(0);
    const pup = screen.getByText("PUP").closest("tr")!;
    expect(within(pup).getByText("BS Accountancy")).toBeTruthy();
    expect(within(pup).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("still shows an entry whose level HR has since retired, by its name", () => {
    render(<EducationBackgroundCard {...base} records={RECORDS} canUpdate={false} />);
    expect(within(screen.getByText("UP").closest("tr")!).getByText("Master’s Degree")).toBeTruthy();
  });

  it("invites adding the first entry when there are none", () => {
    render(<EducationBackgroundCard {...base} records={[]} canUpdate />);
    expect(screen.getByText("No education entries yet.")).toBeTruthy();
    expect(screen.getByTestId("education-add-button")).toBeTruthy();
  });

  it("shows no controls to someone who can't update", () => {
    render(<EducationBackgroundCard {...base} records={RECORDS} canUpdate={false} />);
    expect(screen.queryByTestId("education-add-button")).toBeNull();
    expect(screen.queryByTestId("education-edit-r1")).toBeNull();
    expect(screen.queryByTestId("education-remove-r1")).toBeNull();
  });

  it("gives School the spare room, so a long school name isn't squeezed by the other columns", () => {
    render(<EducationBackgroundCard {...base} records={RECORDS} canUpdate={false} />);
    expect(screen.getByRole("columnheader", { name: "School" }).className).toContain("md:w-full");
    expect(screen.getByRole("columnheader", { name: "Level" }).className).not.toContain("md:w-full");
    expect(screen.getByRole("columnheader", { name: "Year graduated" }).className).not.toContain("md:w-full");
  });

  it("cuts a long school and course with an ellipsis: wrapped for the table, clamped to two lines on a phone", () => {
    const longSchool = "Polytechnic University of the Philippines, Sta. Mesa Main Campus, College of Accountancy and Finance ".repeat(2).trim();
    const longCourse = "Bachelor of Science in Accountancy with a Major in Management Accounting and Auditing ".repeat(2).trim();
    render(<EducationBackgroundCard {...base} records={[{ id: "r9", levelCode: "bachelors_degree", school: longSchool, course: longCourse, yearGraduated: 2015 }]} canUpdate={false} />);

    const school = screen.getByText(longSchool);
    const course = screen.getByText(longCourse);
    for (const element of [school, course]) {
      expect(element.className).toContain("max-md:line-clamp-2");
      expect(element.className).toContain("max-md:break-words");
      // Desktop: the cell's TruncatedCell does the cutting and shows the full text on hover.
      expect(element.closest('[data-testid="truncated-cell"]')).not.toBeNull();
    }
  });

  it("gives an updater add, edit and remove", () => {
    render(<EducationBackgroundCard {...base} records={RECORDS} canUpdate />);
    expect(screen.getByTestId("education-add-button")).toBeTruthy();
    for (const id of ["r1", "r2", "r3"]) {
      expect(screen.getByTestId(`education-edit-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`education-remove-${id}`)).toBeTruthy();
    }
  });
});
