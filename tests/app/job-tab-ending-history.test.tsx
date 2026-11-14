// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { JobTab, type EndingHistoryView } from "@/app/(app)/people/[id]/job-tab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const base = {
  organizationId: "org1",
  employeeId: "e1",
  assignmentHistory: [],
  positionTitleById: new Map<string, string>(),
  projectNameById: new Map<string, string>(),
  canUpdate: false,
  positionOptions: [],
  projectOptions: [],
};

// Oldest first, as the employment stores them; the card shows newest first.
const HISTORY: EndingHistoryView[] = [
  { action: "ended", statusName: "Terminated", lastDayKey: "2026-10-30", reason: "Recorded as terminated", at: "2026-10-30T08:00:00.000Z" },
  { action: "ending_corrected", statusName: "Resigned", lastDayKey: "2026-10-30", reason: "Resignation letter 3 Nov", at: "2026-11-14T02:00:00.000Z" },
  { action: "reinstated", statusName: "Active", lastDayKey: null, reason: "Recorded in error", at: "2026-11-15T03:00:00.000Z" },
];

describe("JobTab ending history", () => {
  it("lists each ending, correction and reinstatement with its status, reason and last day, newest first", () => {
    render(<JobTab {...base} endingHistory={HISTORY} />);

    const card = screen.getByTestId("ending-history");
    const items = within(card).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-action"))).toEqual(["reinstated", "ending_corrected", "ended"]);
    expect(within(items[0]).getByText("Reinstated")).toBeTruthy();
    expect(within(items[0]).getByText(/Recorded in error/)).toBeTruthy();
    expect(within(items[1]).getByText("Ending corrected")).toBeTruthy();
    expect(within(items[1]).getByText(/Resigned/)).toBeTruthy();
    expect(within(items[1]).getByText(/Resignation letter 3 Nov/)).toBeTruthy();
    expect(within(items[2]).getByText("Ended")).toBeTruthy();
    expect(within(items[2]).getByText(/Terminated/)).toBeTruthy();
  });

  it("shows nothing when there is no ending history", () => {
    const { rerender } = render(<JobTab {...base} endingHistory={[]} />);
    expect(screen.queryByTestId("ending-history")).toBeNull();
    rerender(<JobTab {...base} />);
    expect(screen.queryByTestId("ending-history")).toBeNull();
  });
});
