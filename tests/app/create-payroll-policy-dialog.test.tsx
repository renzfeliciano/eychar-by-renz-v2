// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePayrollPolicyDialog } from "@/app/(app)/payroll/policies/create-payroll-policy-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ policy: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

async function openAndName() {
  const user = userEvent.setup();
  render(<CreatePayrollPolicyDialog organizationId="org1" projects={[]} />);
  await user.click(screen.getByTestId("payroll-policies-create-button"));
  await user.type(screen.getByLabelText(/^Name/), "Standard");
  return user;
}

describe("CreatePayrollPolicyDialog holiday and night pay (attendance plan Phase 5)", () => {
  it("sends the GATE 3 defaults and the default holiday mapping", async () => {
    const user = await openAndName();
    await user.click(screen.getByTestId("payroll-policies-create-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      specialHolidayMultiplier: 1.3,
      specialHolidayRestDayMultiplier: 1.5,
      regularHolidayMultiplier: 2,
      regularHolidayRestDayMultiplier: 2.6,
      premiumOvertimeMultiplier: 1.3,
      nightDifferentialRate: 0.1,
      holidayDayTypes: { regular: "regular_holiday", special_non_working: "special_holiday", special_working: "special_working" },
    });
  });

  it("sends the rates HR changes, as multiples", async () => {
    const user = await openAndName();
    fireEvent.change(screen.getByLabelText(/^Regular holiday \(%\)/), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText(/Night differential/), { target: { value: "15" } });
    await user.click(screen.getByTestId("payroll-policies-create-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ regularHolidayMultiplier: 2.5, nightDifferentialRate: 0.15 });
  });
});
