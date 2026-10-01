// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleRosterDialog } from "@/app/(app)/attendance/schedules/schedule-roster-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const ROSTER = [
  { employeeId: "e1", employeeNumber: "EMP-001", name: "Angela Santos", included: true, hidden: false },
  { employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva", included: false, hidden: true },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ updated: 2 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("ScheduleRosterDialog", () => {
  it("shows who is on the schedule and saves only what changed", async () => {
    const user = userEvent.setup();
    render(<ScheduleRosterDialog organizationId="org1" roster={ROSTER} />);

    await user.click(screen.getByTestId("schedule-roster-button"));
    expect(screen.getByText("1 of 2 on the schedule")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Angela Santos/ }));
    await user.click(screen.getByRole("checkbox", { name: /Carlos Villanueva/ }));
    await user.click(screen.getByRole("checkbox", { name: /Carlos Villanueva/ }));
    await user.click(screen.getByTestId("schedule-roster-save-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/attendance/schedules/roster");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", changes: [{ employeeId: "e1", included: false }] });
  });

  it("filters the list by name or employee number", async () => {
    const user = userEvent.setup();
    render(<ScheduleRosterDialog organizationId="org1" roster={ROSTER} />);
    await user.click(screen.getByTestId("schedule-roster-button"));

    await user.type(screen.getByRole("searchbox", { name: "Find employee" }), "EMP-002");

    expect(screen.queryByRole("checkbox", { name: /Angela Santos/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Carlos Villanueva/ })).toBeInTheDocument();
  });

  it("lets only the Super Administrator hide an employee as test data", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ScheduleRosterDialog organizationId="org1" roster={ROSTER} />);
    await user.click(screen.getByTestId("schedule-roster-button"));
    expect(screen.queryByRole("button", { name: "Hide Angela Santos from everyone else" })).not.toBeInTheDocument();
    unmount();

    render(<ScheduleRosterDialog organizationId="org1" roster={ROSTER} canHide />);
    await user.click(screen.getByTestId("schedule-roster-button"));
    expect(screen.getByRole("button", { name: "Unhide Carlos Villanueva" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide Angela Santos from everyone else" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/visibility");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", type: "employee", id: "e1", hidden: true });
  });
});
