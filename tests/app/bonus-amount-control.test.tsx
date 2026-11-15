// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BonusAmountForm, BonusPutBackButton } from "@/app/(app)/payroll/[id]/bonus-amount-control";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const base = { runId: "r1", organizationId: "org1", employeeId: "e1", employeeName: "Angela Santos" };
const sent = () => ({ url: fetchMock.mock.calls[0][0], method: fetchMock.mock.calls[0][1].method, body: JSON.parse(fetchMock.mock.calls[0][1].body) });

describe("BonusAmountForm", () => {
  it("shows the worked-out amount and saves a new one for this person", async () => {
    const user = userEvent.setup();
    render(<BonusAmountForm {...base} computed={5000} amount={5000} overridden={false} />);
    expect(screen.getByText(/Worked out: ₱5,000.00/)).toBeTruthy();

    const input = screen.getByLabelText(/Bonus for Angela Santos/);
    await user.clear(input);
    await user.type(input, "8000");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent()).toEqual({ url: "/api/payroll-runs/r1/bonus", method: "PATCH", body: { organizationId: "org1", employeeId: "e1", amount: 8000 } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("leaves the person out with an amount of zero", async () => {
    const user = userEvent.setup();
    render(<BonusAmountForm {...base} computed={5000} amount={5000} overridden={false} />);
    await user.click(screen.getByRole("button", { name: "Leave out" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().body.amount).toBe(0);
  });

  it("goes back to the worked-out amount after a change", async () => {
    const user = userEvent.setup();
    render(<BonusAmountForm {...base} computed={5000} amount={8000} overridden />);
    await user.click(screen.getByRole("button", { name: /Use ₱5,000.00/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().body.amount).toBeNull();
  });

  it("refuses an amount that isn't a positive number", async () => {
    const user = userEvent.setup();
    render(<BonusAmountForm {...base} computed={5000} amount={5000} overridden={false} />);
    const input = screen.getByLabelText(/Bonus for Angela Santos/);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Save amount" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter an amount above zero, or use Leave out/)).toBeTruthy();
  });

  it("shows the server's reason when the change is refused", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: "Amounts can only change while the bonus run is a draft." }), { status: 422 }));
    render(<BonusAmountForm {...base} computed={5000} amount={5000} overridden={false} />);
    await user.click(screen.getByRole("button", { name: "Leave out" }));
    expect(await screen.findByText("Amounts can only change while the bonus run is a draft.")).toBeTruthy();
  });
});

describe("BonusPutBackButton", () => {
  it("puts a left-out person back at the worked-out amount", async () => {
    const user = userEvent.setup();
    render(<BonusPutBackButton {...base} />);
    await user.click(screen.getByRole("button", { name: "Put Angela Santos back" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().body).toEqual({ organizationId: "org1", employeeId: "e1", amount: null });
  });
});
