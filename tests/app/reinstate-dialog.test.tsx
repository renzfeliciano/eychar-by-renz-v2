// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReinstateDialog } from "@/app/(app)/people/[id]/reinstate-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const props = { organizationId: "org1", employeeId: "e1", employeeName: "Florence San Diego", blockedReason: null as string | null };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ employment: { status: "active" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("ReinstateDialog", () => {
  it("requires a reason before sending anything", async () => {
    const user = userEvent.setup();
    render(<ReinstateDialog {...props} />);

    await user.click(screen.getByTestId("reinstate-button"));
    await user.click(screen.getByTestId("reinstate-submit"));

    expect(await screen.findByText("Enter why the employment is being reinstated.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the reason, says they are back, and refreshes", async () => {
    const user = userEvent.setup();
    render(<ReinstateDialog {...props} />);

    await user.click(screen.getByTestId("reinstate-button"));
    await user.type(screen.getByLabelText(/Reason/), "The termination was recorded in error");
    await user.click(screen.getByTestId("reinstate-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/employment/reinstate");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", reason: "The termination was recorded in error" });
    expect(success).toHaveBeenCalledWith("Florence San Diego is back on the active roster");
  });

  it("shows why it is blocked and keeps submit off", async () => {
    const user = userEvent.setup();
    render(<ReinstateDialog {...props} blockedReason="Final pay was already paid out, so this employment can't be reinstated." />);

    await user.click(screen.getByTestId("reinstate-button"));
    expect(screen.getByText(/Final pay was already paid out/)).toBeTruthy();
    expect(screen.getByTestId("reinstate-submit")).toBeDisabled();
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "A clearance is still open for this employee. Cancel it first, then reinstate." }), { status: 422 }));
    const user = userEvent.setup();
    render(<ReinstateDialog {...props} />);

    await user.click(screen.getByTestId("reinstate-button"));
    await user.type(screen.getByLabelText(/Reason/), "Recorded in error");
    await user.click(screen.getByTestId("reinstate-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("clearance is still open");
    expect(refresh).not.toHaveBeenCalled();
  });
});
