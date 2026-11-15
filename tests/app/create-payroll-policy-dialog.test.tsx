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

describe("CreatePayrollPolicyDialog pay frequency (payroll plan Phase 6)", () => {
  async function chooseFrequency(label: string) {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreatePayrollPolicyDialog organizationId="org1" projects={[]} />);
    await user.click(screen.getByTestId("payroll-policies-create-button"));
    await user.type(screen.getByLabelText(/^Name/), "Standard");
    await user.click(screen.getByLabelText(/Pay frequency/));
    await user.click(await screen.findByRole("option", { name: label }));
    return user;
  }

  it("offers every frequency and defaults to semi-monthly, with no warning", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<CreatePayrollPolicyDialog organizationId="org1" projects={[]} />);
    await user.click(screen.getByTestId("payroll-policies-create-button"));
    await user.click(screen.getByLabelText(/Pay frequency/));
    for (const name of ["Weekly", "Bi-weekly", "Semi-monthly", "Monthly"]) expect((await screen.findAllByRole("option", { name })).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("monthly-pay-notice")).toBeNull();
  });

  it("warns on monthly and won't save until the acknowledgement is ticked", async () => {
    const user = await chooseFrequency("Monthly");
    expect(screen.getByTestId("monthly-pay-notice")).toHaveTextContent("Art. 103");
    await user.click(screen.getByTestId("payroll-policies-create-submit-button"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Tick the acknowledgement to choose monthly pay.")).toBeTruthy();

    await user.click(screen.getByTestId("monthly-pay-notice-acknowledge"));
    await user.click(screen.getByTestId("payroll-policies-create-submit-button"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ payFrequency: "monthly", acknowledgeMonthlyPay: true });
  });

  it("sends bi-weekly without an acknowledgement", async () => {
    const user = await chooseFrequency("Bi-weekly");
    await user.click(screen.getByTestId("payroll-policies-create-submit-button"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.payFrequency).toBe("bi-weekly");
    expect(body).not.toHaveProperty("acknowledgeMonthlyPay");
  });
});
