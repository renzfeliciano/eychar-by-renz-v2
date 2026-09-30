// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenClearanceDialog } from "@/app/(app)/clearance/open-clearance-dialog";
import { ClearanceItemActions } from "@/app/(app)/clearance/[id]/clearance-item-actions";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ clearance: { _id: "c1" } }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("OpenClearanceDialog", () => {
  it("records the separation and how the notice was received, then opens the new case", async () => {
    const user = userEvent.setup();
    render(
      <OpenClearanceDialog
        organizationId="org1"
        employees={[{ id: "e1", label: "Ana Reyes (EMP-001)" }]}
        separationTypes={[{ id: "resignation", label: "Resignation" }]}
        todayKey="2026-09-30"
      />,
    );

    await user.click(screen.getByTestId("clearance-open-button"));
    await user.click(screen.getByTestId("clearance-employee-select"));
    await user.click(await screen.findByRole("option", { name: "Ana Reyes (EMP-001)" }));
    await user.click(screen.getByTestId("clearance-type-select"));
    await user.click(await screen.findByRole("option", { name: "Resignation" }));
    fireEvent.change(screen.getByLabelText(/Notice received/), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText(/Last working day/), { target: { value: "2026-10-28" } });
    await user.type(screen.getByLabelText(/How notice was received/), "Resignation letter by email");
    await user.click(screen.getByTestId("clearance-open-submit-button"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/clearance/c1"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      organizationId: "org1",
      employeeId: "e1",
      separationTypeCode: "resignation",
      noticeDate: "2026-09-28",
      lastWorkingDay: "2026-10-28",
      noticeReference: "Resignation letter by email",
    });
  });

  it("asks for the employee and separation type before sending", async () => {
    const user = userEvent.setup();
    render(<OpenClearanceDialog organizationId="org1" employees={[]} separationTypes={[]} todayKey="2026-09-30" />);

    await user.click(screen.getByTestId("clearance-open-button"));
    await user.click(screen.getByTestId("clearance-open-submit-button"));

    expect(screen.getByRole("alert")).toHaveTextContent("Select the employee and the separation type.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ClearanceItemActions", () => {
  const props = { organizationId: "org1", caseId: "c1", itemId: "i1", itemTitle: "Return laptop", status: "pending", canSignOff: true, canWaive: true };

  it("clears an item in one click", async () => {
    const user = userEvent.setup();
    render(<ClearanceItemActions {...props} />);

    await user.click(screen.getByRole("button", { name: "Clear Return laptop" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/clearance/c1/items/i1");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", action: "clear" });
  });

  it("flags an item with what was found and the amount owed", async () => {
    const user = userEvent.setup();
    render(<ClearanceItemActions {...props} />);

    await user.click(screen.getByRole("button", { name: "More actions for Return laptop" }));
    await user.click(await screen.findByRole("menuitem", { name: /Flag an issue/ }));
    await user.type(screen.getByLabelText(/What was found/), "Screen damaged");
    await user.type(screen.getByLabelText(/Amount owed/), "8500");
    await user.click(screen.getByTestId("clearance-item-confirm-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", action: "flag", note: "Screen damaged", amount: 8500 });
  });

  it("hides waiving without the waive permission, and offers reopen on a resolved item", async () => {
    const user = userEvent.setup();
    render(<ClearanceItemActions {...props} status="cleared" canWaive={false} />);

    expect(screen.queryByRole("button", { name: "Clear Return laptop" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions for Return laptop" }));
    expect(await screen.findByRole("menuitem", { name: /Reopen/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Waive/ })).not.toBeInTheDocument();
  });
});
