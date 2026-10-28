// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeEmploymentDialog } from "@/app/(app)/people/[id]/change-employment-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const TYPES = [
  { code: "regular", name: "Regular", requiresEndOfContract: false },
  { code: "probationary", name: "Probationary", requiresEndOfContract: true },
  { code: "contractual", name: "Contractual", requiresEndOfContract: true },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ employment: { employmentType: "regular" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = { organizationId: "org1", employeeId: "e1", employeeName: "Debbie Abellara", currentType: "probationary", currentEndKey: "2026-11-01", types: TYPES, todayKey: "2026-10-28" };

describe("ChangeEmploymentDialog", () => {
  it("regularizes: no end date is sent, and the toast says what changed", async () => {
    const user = userEvent.setup();
    render(<ChangeEmploymentDialog {...props} />);

    await user.click(screen.getByTestId("change-employment-button"));
    await user.click(screen.getByTestId("change-employment-type"));
    await user.click(await screen.findByRole("option", { name: "Regular" }));
    expect(screen.queryByLabelText(/End of contract/)).toBeNull();
    await user.type(screen.getByLabelText(/Note/), "Passed evaluation");
    await user.click(screen.getByTestId("change-employment-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/employment/terms");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", employmentType: "regular", effectiveFrom: "2026-10-28", note: "Passed evaluation" });
    expect(success).toHaveBeenCalledWith("Debbie Abellara is now Regular");
  });

  it("asks for the end of contract when the type ends, before sending", async () => {
    const user = userEvent.setup();
    render(<ChangeEmploymentDialog {...props} currentEndKey={null} />);

    await user.click(screen.getByTestId("change-employment-button"));
    await user.click(screen.getByTestId("change-employment-type"));
    await user.click(await screen.findByRole("option", { name: "Contractual" }));
    await user.click(screen.getByTestId("change-employment-submit"));

    expect(await screen.findByText(/Contractual needs an end date/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/End of contract/), { target: { value: "2027-04-30" } });
    await user.click(screen.getByTestId("change-employment-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ employmentType: "contractual", endOfContract: "2027-04-30" });
  });

  it("shows the server's reason when the change is refused", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Nothing changed: pick a different type or end date" }), { status: 422 }));
    const user = userEvent.setup();
    render(<ChangeEmploymentDialog {...props} />);

    await user.click(screen.getByTestId("change-employment-button"));
    await user.click(screen.getByTestId("change-employment-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing changed");
    expect(refresh).not.toHaveBeenCalled();
  });
});
