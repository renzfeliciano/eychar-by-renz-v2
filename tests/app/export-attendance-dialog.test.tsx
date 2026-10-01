// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportAttendanceDialog } from "@/app/(app)/attendance/export-attendance-dialog";

function query(link: HTMLElement) {
  return Object.fromEntries(new URL(link.getAttribute("href")!, "http://localhost").searchParams);
}

async function open() {
  const user = userEvent.setup();
  render(<ExportAttendanceDialog organizationId="64b7f0c2a1b2c3d4e5f60718" date="2026-10-05" />);
  await user.click(screen.getByTestId("attendance-export-button"));
  return user;
}

describe("ExportAttendanceDialog", () => {
  it("exports the day on screen by default", async () => {
    await open();
    expect(query(screen.getByTestId("attendance-export-xlsx"))).toEqual({ organizationId: "64b7f0c2a1b2c3d4e5f60718", from: "2026-10-05", to: "2026-10-05", format: "xlsx" });
    expect(query(screen.getByTestId("attendance-export-csv"))).toMatchObject({ format: "csv" });
  });

  it("offers the payroll cutoffs and the whole month of the day shown", async () => {
    const user = await open();

    await user.click(screen.getByRole("radio", { name: "Oct 16–31" }));
    expect(query(screen.getByTestId("attendance-export-xlsx"))).toMatchObject({ from: "2026-10-16", to: "2026-10-31" });

    await user.click(screen.getByRole("radio", { name: "Oct 1–15" }));
    expect(query(screen.getByTestId("attendance-export-csv"))).toMatchObject({ from: "2026-10-01", to: "2026-10-15" });

    await user.click(screen.getByRole("radio", { name: "All of October" }));
    expect(query(screen.getByTestId("attendance-export-csv"))).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("blocks a range that ends before it starts", async () => {
    const user = await open();

    const to = screen.getByLabelText("To");
    await user.clear(to);
    await user.type(to, "2026-10-01");

    expect(screen.getByText("The end date can't be before the start date.")).toBeInTheDocument();
    expect(screen.queryByTestId("attendance-export-xlsx")).not.toHaveAttribute("href");
  });
});
