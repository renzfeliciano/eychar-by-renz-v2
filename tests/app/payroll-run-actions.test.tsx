// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunActions } from "@/app/(app)/payroll/[id]/run-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "submitted" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = {
  runId: "run1",
  runNumber: "PR-2026-0001",
  organizationId: "org1",
  status: "draft",
  canUpdate: true,
  canApprove: false,
  canRelease: false,
  blockingIssues: 0,
  employees: 3,
  netPayLabel: "₱45,000.00",
};

describe("RunActions submit", () => {
  it("asks for a reason for each employee the run leaves out, and sends them", async () => {
    const user = userEvent.setup();
    render(<RunActions {...props} exclusions={[{ employeeId: "e9", employeeName: "Unpaid Santos", reason: "No pay terms on Oct 15, 2026" }]} />);

    await user.click(screen.getByTestId("payroll-run-submit"));
    expect(screen.getByText("No pay terms on Oct 15, 2026")).toBeTruthy();
    await user.click(screen.getByTestId("payroll-run-dialog-confirm"));
    expect(await screen.findByText(/Give a reason for each employee left out: Unpaid Santos/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Unpaid Santos/), "On unpaid leave");
    await user.click(screen.getByTestId("payroll-run-dialog-confirm"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", action: "submit", exclusionReasons: [{ employeeId: "e9", reason: "On unpaid leave" }] });
  });

  it("submits as before when no one is left out", async () => {
    const user = userEvent.setup();
    render(<RunActions {...props} />);

    await user.click(screen.getByTestId("payroll-run-submit"));
    expect(screen.queryByTestId("payroll-run-exclusion-reasons")).toBeNull();
    await user.click(screen.getByTestId("payroll-run-dialog-confirm"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", action: "submit" });
  });
});
