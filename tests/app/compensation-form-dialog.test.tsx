// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompensationFormDialog } from "@/app/(app)/payroll/compensation/compensation-form-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ compensation: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const base = { organizationId: "org1", employeeId: "e1", employeeName: "Adrian Napay" };
const current = { rateType: "monthly" as const, rate: 25000, allowances: [], minimumWageEarner: false };

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("compensation-save"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("CompensationFormDialog: revising pay", () => {
  it("shows the recorded salary, takes an editable basic and annual increase, and totals them (Adrian Napay's example)", async () => {
    const user = userEvent.setup();
    render(<CompensationFormDialog {...base} current={current} recordedRate={25000} />);
    await user.click(screen.getByTestId("compensation-revise-e1"));

    expect(screen.getByTestId("compensation-recorded")).toHaveTextContent("₱25,000.00");
    const basic = screen.getByLabelText(/Revised basic salary/);
    await user.clear(basic);
    await user.type(basic, "37000");
    await user.type(screen.getByLabelText(/Annual increase/), "3000");
    expect(screen.getByTestId("compensation-total")).toHaveTextContent("₱40,000.00");
    const date = screen.getByLabelText(/Effective from/);
    await user.clear(date);
    await user.type(date, "2026-12-01");

    const body = await save(user);
    expect(body).toMatchObject({ baseRate: 37000, annualIncrease: 3000, effectiveFrom: "2026-12-01", rateType: "monthly" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/compensation/e1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  });

  it("starts the basic at the recorded salary with no increase", async () => {
    const user = userEvent.setup();
    render(<CompensationFormDialog {...base} current={current} recordedRate={25000} />);
    await user.click(screen.getByTestId("compensation-revise-e1"));

    expect(screen.getByLabelText(/Revised basic salary/)).toHaveValue(25000);
    expect(screen.getByLabelText(/Annual increase/)).toHaveValue(null);
    expect(screen.getByTestId("compensation-total")).toHaveTextContent("₱25,000.00");
    const body = await save(user);
    expect(body).toMatchObject({ baseRate: 25000, annualIncrease: 0 });
  });

  it("edits a scheduled change on its own date, prefilled with what was entered, so a mistake can be corrected", async () => {
    const user = userEvent.setup();
    render(
      <CompensationFormDialog
        {...base}
        current={{ ...current, rate: 6700, baseRate: 3700, annualIncrease: 3000 }}
        recordedRate={25000}
        editingFrom="2026-12-01"
      />,
    );
    await user.click(screen.getByTestId("compensation-revise-e1"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Dec 1, 2026/)).toBeTruthy();
    expect(screen.getByLabelText(/Effective from/)).toHaveValue("2026-12-01");
    expect(screen.getByLabelText(/Annual increase/)).toHaveValue(3000);
    const basic = screen.getByLabelText(/Revised basic salary/);
    expect(basic).toHaveValue(3700);
    await user.clear(basic);
    await user.type(basic, "37000");

    const body = await save(user);
    expect(body).toMatchObject({ baseRate: 37000, annualIncrease: 3000, effectiveFrom: "2026-12-01" });
  });
});

describe("CompensationFormDialog: first pay terms", () => {
  it("asks for the basic salary and an optional increase, with no recorded salary", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ compensation: {} }), { status: 201 }));
    render(<CompensationFormDialog {...base} />);
    await user.click(screen.getByTestId("compensation-set-e1"));

    expect(screen.queryByTestId("compensation-recorded")).toBeNull();
    await user.type(screen.getByLabelText(/Basic salary/), "20000");
    const body = await save(user);
    expect(body).toMatchObject({ employeeId: "e1", baseRate: 20000, annualIncrease: 0 });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
});
