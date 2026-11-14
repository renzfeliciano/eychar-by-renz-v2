// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditEndingDialog } from "@/app/(app)/people/[id]/edit-ending-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args) } }));

const REASONS = [
  { code: "resigned", name: "Resigned", requiresNote: false },
  { code: "terminated", name: "Terminated", requiresNote: true },
  { code: "awol", name: "AWOL", requiresNote: true },
];
const props = {
  organizationId: "org1",
  employeeId: "e1",
  employeeName: "Florence San Diego",
  reasons: REASONS,
  todayKey: "2026-11-14",
  hiredKey: "2025-03-03",
  current: { status: "terminated", effectiveToKey: "2026-10-30", note: "Recorded as terminated" },
  lastDayLockedReason: null as string | null,
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ employment: { status: "resigned" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("edit-ending-button"));
}
async function chooseReason(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByTestId("edit-ending-reason"));
  const option = await screen.findByRole("option", { name });
  await user.click(option);
}

// jsdom never finishes positioning a select popup: it can stay at pointer-events: none (a limit of the test
// environment, not of the dialog), so the click library's pointer-events check is turned off for these tests.
const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("EditEndingDialog", () => {
  it("starts on the ending as recorded: the reason, the last day and the note", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);

    expect(screen.getByTestId("edit-ending-reason")).toHaveTextContent("Terminated");
    expect(screen.getByLabelText(/Last day of employment/)).toHaveValue("2026-10-30");
    expect(screen.getByLabelText(/Note/)).toHaveValue("Recorded as terminated");
  });

  it("keeps Save off until something changes", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);
    expect(screen.getByTestId("edit-ending-submit")).toBeDisabled();

    await chooseReason(user, "Resigned");
    expect(screen.getByTestId("edit-ending-submit")).toBeEnabled();
  });

  it("corrects Terminated to Resigned and refreshes", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);
    await chooseReason(user, "Resigned");
    await user.clear(screen.getByLabelText(/Note/));
    await user.type(screen.getByLabelText(/Note/), "Resignation letter 3 Nov 2026");
    await user.click(screen.getByTestId("edit-ending-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/employees/e1/employment/ending");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(sentBody()).toEqual({ organizationId: "org1", status: "resigned", effectiveTo: "2026-10-30", terminationReason: "Resignation letter 3 Nov 2026" });
    expect(success).toHaveBeenCalledWith("Florence San Diego's ending was corrected: Resigned");
  });

  it("changes the last day when it is free to change", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);
    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2026-10-28" } });
    await user.click(screen.getByTestId("edit-ending-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({ effectiveTo: "2026-10-28" });
  });

  it("locks the last day with the reason, and leaves it out of what it sends", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} lastDayLockedReason="The last day can't change: a final settlement was already prepared from it. Cancel the settlement first." />);
    await open(user);

    expect(screen.getByLabelText(/Last day of employment/)).toBeDisabled();
    expect(screen.getByText(/final settlement was already prepared/)).toBeTruthy();
    await chooseReason(user, "Resigned");
    await user.click(screen.getByTestId("edit-ending-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).not.toHaveProperty("effectiveTo");
  });

  it("refuses a future last day, one before the hire date, and a missing note where the reason needs one", async () => {
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);

    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2026-12-15" } });
    await user.click(screen.getByTestId("edit-ending-submit"));
    expect(await screen.findByText(/can't be in the future yet/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2025-01-01" } });
    await user.click(screen.getByTestId("edit-ending-submit"));
    expect(await screen.findByText(/before .* was hired/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Last day of employment/), { target: { value: "2026-10-30" } });
    await user.clear(screen.getByLabelText(/Note/));
    await chooseReason(user, "AWOL");
    await user.click(screen.getByTestId("edit-ending-submit"));
    expect(await screen.findByText(/Add a note for AWOL/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason and stays open", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Nothing changed: pick a different reason, last day or note." }), { status: 422 }));
    const user = setupUser();
    render(<EditEndingDialog {...props} />);
    await open(user);
    await chooseReason(user, "Resigned");
    await user.click(screen.getByTestId("edit-ending-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing changed");
    expect(refresh).not.toHaveBeenCalled();
  });
});
