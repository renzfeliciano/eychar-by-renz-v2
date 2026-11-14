// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndEmploymentDialog } from "@/app/(app)/people/[id]/end-employment-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const REASONS = [
  { code: "resigned", name: "Resigned", requiresNote: false },
  { code: "terminated", name: "Terminated", requiresNote: true },
  { code: "awol", name: "AWOL", requiresNote: true },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ employment: { status: "resigned" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = { organizationId: "org1", employeeId: "e1", employeeName: "Debbie Abellara", reasons: REASONS, todayKey: "2026-11-14", hiredKey: "2025-03-03" };

async function openAndPick(user: ReturnType<typeof userEvent.setup>, reason: string) {
  await user.click(screen.getByTestId("end-employment-button"));
  await user.click(screen.getByTestId("end-employment-reason"));
  const option = await screen.findByRole("option", { name: reason });
  await user.click(option);
}

// jsdom never finishes positioning a select popup: it can stay at pointer-events: none (a limit of the test
// environment, not of the dialog), so the click library's pointer-events check is turned off for these tests.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("EndEmploymentDialog", () => {
  it("records a resignation as Resigned, effective today, with no note needed", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Resigned");
    await user.click(screen.getByTestId("end-employment-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/employment");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", status: "resigned", effectiveTo: "2026-11-14" });
    expect(success).toHaveBeenCalledWith("Debbie Abellara's employment ended: Resigned");
  });

  it("makes HR choose a reason: nothing is preselected, so a resignation is never saved as a termination by default", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await user.click(screen.getByTestId("end-employment-button"));
    await user.click(screen.getByTestId("end-employment-submit"));

    expect(await screen.findByText(/Choose why the employment is ending/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a note when the reason needs one, then sends it", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Terminated");
    await user.click(screen.getByTestId("end-employment-submit"));
    expect(await screen.findByText(/Add a note for Terminated/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Note/), "Second written warning, 3 Nov 2026");
    await user.click(screen.getByTestId("end-employment-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      organizationId: "org1",
      status: "terminated",
      effectiveTo: "2026-11-14",
      terminationReason: "Second written warning, 3 Nov 2026",
    });
  });

  it("sends the last working day when it is in the past", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Resigned");
    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2026-11-10" } });
    await user.click(screen.getByTestId("end-employment-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ status: "resigned", effectiveTo: "2026-11-10" });
  });

  it("refuses a future date before sending, and tells HR to come back on the last working day", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Resigned");
    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2026-12-15" } });
    await user.click(screen.getByTestId("end-employment-submit"));

    expect(await screen.findByText(/can't be in the future yet/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a date before the hire date before sending", async () => {
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Resigned");
    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2025-01-01" } });
    await user.click(screen.getByTestId("end-employment-submit"));

    expect(await screen.findByText(/before .* was hired/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open when the change is refused", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "This employment record has already ended" }), { status: 422 }));
    const user = setupUser();
    render(<EndEmploymentDialog {...props} />);

    await openAndPick(user, "Resigned");
    await user.click(screen.getByTestId("end-employment-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("already ended");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("end-employment-submit")).toBeTruthy();
  });
});
