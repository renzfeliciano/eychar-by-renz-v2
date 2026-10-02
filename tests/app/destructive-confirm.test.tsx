// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { RemoveLineButton } from "@/app/(app)/final-settlements/[id]/remove-line-button";
import { RunRegister } from "@/app/(app)/payroll/[id]/run-register";
import type { AdjustmentRow, RegisterRow } from "@/app/(app)/payroll/[id]/run-types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("RemoveLineButton", () => {
  it("asks before removing, then confirms with a toast", async () => {
    const user = userEvent.setup();
    render(<RemoveLineButton organizationId="org1" settlementId="s1" lineId="l1" label="Unpaid allowance" />);

    await user.click(screen.getByRole("button", { name: "Remove Unpaid allowance" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove line" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/final-settlements/s1/lines/l1?organizationId=org1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(toast.success).toHaveBeenCalledWith("Removed Unpaid allowance");
  });

  it("keeps the dialog open with the reason when removal fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "The settlement is no longer a draft" }), { status: 409 }));
    const user = userEvent.setup();
    render(<RemoveLineButton organizationId="org1" settlementId="s1" lineId="l1" label="Unpaid allowance" />);

    await user.click(screen.getByRole("button", { name: "Remove Unpaid allowance" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove line" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The settlement is no longer a draft");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("can be cancelled without removing anything", async () => {
    const user = userEvent.setup();
    render(<RemoveLineButton organizationId="org1" settlementId="s1" lineId="l1" label="Unpaid allowance" />);
    await user.click(screen.getByRole("button", { name: "Remove Unpaid allowance" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep it" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const ROW: RegisterRow = {
  id: "rec1",
  employeeId: "emp1",
  employeeNumber: "E-001",
  employeeName: "Ana Reyes",
  projectName: null,
  rateType: "monthly",
  rate: 30000,
  dailyRate: 1363.64,
  hourlyRate: 170.45,
  attendance: { scheduledDays: 11, eligibleDays: 11, daysWorked: 11, paidLeaveDays: 0, absentDays: 0, missingDays: 0, restDaysWorked: 0, lateMinutes: 0, undertimeMinutes: 0 },
  earnings: [{ code: "basic", label: "Basic pay", amount: 15000 }],
  contributions: [],
  deductions: [],
  grossPay: 15000,
  taxableIncome: 15000,
  tax: 0,
  employeeContributions: 0,
  employerContributions: 0,
  totalDeductions: 0,
  netPay: 15000,
  previousNetPay: null,
  warnings: [],
};
const ADJUSTMENT: AdjustmentRow = { id: "adj1", employeeId: "emp1", category: "loan", label: "Salary loan", direction: "deduction", amount: 500, taxable: false, notes: null };

describe("RunRegister adjustment removal", () => {
  it("asks before removing an adjustment, then confirms with a toast", async () => {
    const user = userEvent.setup();
    const props = { runId: "run1", organizationId: "org1", records: [ROW], adjustments: [ADJUSTMENT], editable: true, overtimeMultiplier: 1.25 };
    render(<RunRegister {...props} />);

    await user.click(screen.getByRole("button", { name: "Open Ana Reyes's payslip" }));
    await user.click(await screen.findByRole("button", { name: "Remove Salary loan" }));
    expect(fetchMock).not.toHaveBeenCalled();

    const confirm = await screen.findByRole("button", { name: "Remove adjustment" });
    await user.click(confirm);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/payroll-runs/run1/adjustments/adj1?organizationId=org1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
    expect(toast.success).toHaveBeenCalledWith("Removed Salary loan; payroll recomputed");
  });
});
