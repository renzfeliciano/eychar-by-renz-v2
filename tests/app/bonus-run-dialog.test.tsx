// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BonusRunDialog } from "@/app/(app)/payroll/bonus-run-dialog";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: { _id: "r1", runNumber: "PR-2026-0009" } }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = { organizationId: "org1", projects: [{ id: "p1", label: "EGI Rufino" }], currentYear: 2026 };
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

async function open(user: ReturnType<typeof setupUser>) {
  render(<BonusRunDialog {...props} />);
  await user.click(screen.getByTestId("payroll-bonus-button"));
}

async function submit(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId("payroll-bonus-submit"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("BonusRunDialog", () => {
  it("prepares a Christmas bonus as a fixed amount by default", async () => {
    const user = setupUser();
    await open(user);
    expect(screen.getByLabelText(/Bonus name/)).toHaveValue("Christmas bonus");
    await user.type(screen.getByLabelText(/Amount per employee/), "5000");
    await user.type(screen.getByLabelText(/Pay date/), "2026-12-15");

    const body = await submit(user);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/payroll-runs/bonus");
    expect(body).toMatchObject({ organizationId: "org1", label: "Christmas bonus", year: 2026, payDate: "2026-12-15", basis: "fixed", value: 5000, prorate: false, minServiceMonths: 0 });
    expect(push).toHaveBeenCalledWith("/payroll/r1");
  });

  it("lets HR pick a percentage of salary, prorate, a minimum service and a project", async () => {
    const user = setupUser();
    await open(user);
    const name = screen.getByLabelText(/Bonus name/);
    await user.clear(name);
    await user.type(name, "Year-end bonus");
    await user.click(screen.getByTestId("payroll-bonus-basis"));
    await user.click(await screen.findByRole("option", { name: "% of monthly salary" }));
    await user.type(screen.getByLabelText(/Percent of monthly salary/), "50");
    await user.click(screen.getByRole("checkbox", { name: /Prorate by months worked/ }));
    await user.type(screen.getByLabelText(/Minimum months of service/), "6");
    await user.click(screen.getByTestId("payroll-bonus-scope"));
    await user.click(await screen.findByRole("option", { name: "EGI Rufino" }));
    await user.type(screen.getByLabelText(/Pay date/), "2026-12-15");

    const body = await submit(user);
    expect(body).toMatchObject({ label: "Year-end bonus", basis: "percent_of_monthly", value: 50, prorate: true, minServiceMonths: 6, projectId: "p1" });
  });

  it("explains how the amount works out for a sample salary", async () => {
    const user = setupUser();
    await open(user);
    await user.click(screen.getByTestId("payroll-bonus-basis"));
    await user.click(await screen.findByRole("option", { name: "Months of pay" }));
    await user.type(screen.getByLabelText(/Months of pay per employee/), "0.5");
    expect(screen.getByTestId("payroll-bonus-example")).toHaveTextContent("₱25,000.00 a month → ₱12,500.00");
  });

  it("asks for the amount and pay date before sending", async () => {
    const user = setupUser();
    await open(user);
    await user.click(screen.getByTestId("payroll-bonus-submit"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter the amount and the pay date/)).toBeTruthy();
  });

  it("shows the server's reason when it can't prepare the run", async () => {
    const user = setupUser();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "No payroll policy applies on Dec 15, 2026." }), { status: 404 }));
    await open(user);
    await user.type(screen.getByLabelText(/Amount per employee/), "5000");
    await user.type(screen.getByLabelText(/Pay date/), "2026-12-15");
    await user.click(screen.getByTestId("payroll-bonus-submit"));
    expect(await screen.findByText("No payroll policy applies on Dec 15, 2026.")).toBeTruthy();
  });
});
