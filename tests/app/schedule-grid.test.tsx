// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleGrid } from "@/app/(app)/attendance/schedules/schedule-grid";
import { monthDays, type ScheduleMonthView } from "@/domains/attendance/schedule-service";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const CELL = {
  shiftTemplateId: "s1",
  code: "D",
  name: "Day",
  kind: "work" as const,
  color: "blue",
  pattern: "fixed" as const,
  startTime: "08:00",
  endTime: "17:00",
  latestStartTime: null,
  requiredHours: null,
  customTimes: false,
};

const VIEW: ScheduleMonthView = {
  month: "2026-10",
  label: "October 2026",
  days: monthDays("2026-10"),
  rows: [
    {
      employeeId: "e1",
      employeeNumber: "EMP-001",
      name: "Angela Santos",
      cells: {
        "2026-10-01": { ...CELL, projectId: "p1", projectName: "EGI Rufino" },
        "2026-10-02": { ...CELL, startTime: "10:00", endTime: "19:00", customTimes: true, projectId: null, projectName: null },
      },
    },
    { employeeId: "e2", employeeNumber: "EMP-002", name: "Carlos Villanueva", cells: {} },
  ],
};

const SHIFT_EXTRA = { pattern: "fixed" as const, latestStartTime: null, requiredHours: null };
const SHIFTS = [
  { id: "s1", name: "Day", code: "D", kind: "work" as const, startTime: "08:00", endTime: "17:00", status: "active", color: "blue", ...SHIFT_EXTRA },
  { id: "s2", name: "Rest day", code: "RD", kind: "rest" as const, startTime: null, endTime: null, status: "active", color: "slate", ...SHIFT_EXTRA },
];

function renderGrid(overrides: Partial<Parameters<typeof ScheduleGrid>[0]> = {}) {
  return render(
    <ScheduleGrid organizationId="org1" view={VIEW} shifts={SHIFTS} projects={[{ id: "p1", label: "EGI Rufino" }]} canUpdate todayKey="2026-10-01" {...overrides} />,
  );
}

/** Opens a date's day panel and uses its "Select everyone on this day". */
async function selectWholeDay(user: ReturnType<typeof userEvent.setup>, date: string) {
  await user.click(screen.getByTestId(`schedule-day-${date}`));
  await user.click(await screen.findByTestId("day-details-select-day"));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: 1, cleared: 0 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("ScheduleGrid", () => {
  it("shows each scheduled day's shift code and site, with a readable label", () => {
    renderGrid();
    const cell = screen.getByRole("button", { name: /Angela Santos, Thursday 1: Day 08:00–17:00 at EGI Rufino/ });
    expect(within(cell).getByText("D")).toBeInTheDocument();
    expect(within(cell).getByText("EGI Rufino")).toBeInTheDocument();
  });

  it("tints each scheduled day with its shift color, and marks a day with custom hours", () => {
    renderGrid();

    const day = screen.getByRole("button", { name: /Angela Santos, Thursday 1: Day/ });
    expect(day.closest("td")!.className).toMatch(/bg-blue-100/);

    const custom = screen.getByRole("button", { name: /Angela Santos, Friday 2: Day 10:00–19:00 \(custom hours\)/ });
    expect(within(custom).getByTestId("schedule-custom-marker")).toBeInTheDocument();
  });

  it("assigns custom hours for the selected days when HR sets them", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByRole("button", { name: "Carlos Villanueva, Monday 5: not scheduled" }));
    await user.click(screen.getByTestId("schedule-assign-button"));
    await user.click(screen.getByTestId("schedule-shift-select"));
    await user.click(await screen.findByRole("option", { name: /D · Day/ }));
    await user.click(screen.getByRole("checkbox", { name: /Custom hours for these days/ }));
    fireEvent.change(screen.getByLabelText("Custom start"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("Custom end"), { target: { value: "19:00" } });
    await user.click(screen.getByTestId("schedule-assign-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).entries).toEqual([
      { employeeId: "e2", date: "2026-10-05", shiftTemplateId: "s1", startTime: "10:00", endTime: "19:00" },
    ]);
  });

  it("selects a range within a row with shift-click", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByRole("button", { name: "Carlos Villanueva, Monday 5: not scheduled" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "Carlos Villanueva, Friday 9: not scheduled" }));
    await user.keyboard("{/Shift}");

    expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("5 days selected");
  });

  it("selects a whole row from the name, and a whole column from the date", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByTitle("Select all of Carlos Villanueva's days"));
    expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("31 days selected");

    await user.click(screen.getByTitle("Select all of Carlos Villanueva's days"));
    await selectWholeDay(user, "2026-10-05");
    await waitFor(() => expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("2 days selected"));
  });

  it("assigns the chosen shift and project to every selected day", async () => {
    const user = userEvent.setup();
    renderGrid();

    await selectWholeDay(user, "2026-10-05");
    await user.click(await screen.findByTestId("schedule-assign-button"));
    await user.click(screen.getByTestId("schedule-shift-select"));
    await user.click(await screen.findByRole("option", { name: /D · Day/ }));
    await user.click(screen.getByTestId("schedule-project-select"));
    await user.click(await screen.findByRole("option", { name: "EGI Rufino" }));
    await user.click(screen.getByTestId("schedule-assign-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/attendance/schedules");
    expect(JSON.parse(init.body)).toEqual({
      organizationId: "org1",
      entries: [
        { employeeId: "e1", date: "2026-10-05", shiftTemplateId: "s1", projectId: "p1" },
        { employeeId: "e2", date: "2026-10-05", shiftTemplateId: "s1", projectId: "p1" },
      ],
    });
  });

  it("is read-only without edit permission", () => {
    renderGrid({ canUpdate: false });
    expect(screen.queryByRole("button", { name: /not scheduled/ })).not.toBeInTheDocument();
    expect(within(screen.getByTitle(/Angela Santos, Thursday 1: Day/)).getByText("D")).toBeInTheDocument();
  });

  it("keeps the how-to hint on screen while days are selected", async () => {
    const user = userEvent.setup();
    renderGrid();
    const hint = /Select days to schedule\. Shift-click selects a range; click a name to select the whole row, or a date for its notes and to select the column\./;

    expect(screen.getByText(hint)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Carlos Villanueva, Monday 5: not scheduled" }));
    expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("1 day selected");
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("drags across cells to select a block spanning several employees", () => {
    renderGrid();
    const start = screen.getByRole("button", { name: "Angela Santos, Monday 5: not scheduled" });
    const end = screen.getByRole("button", { name: "Carlos Villanueva, Wednesday 7: not scheduled" });

    fireEvent.pointerDown(start, { button: 0, pointerType: "mouse" });
    fireEvent.pointerEnter(end, { pointerType: "mouse" });
    fireEvent.pointerUp(window);
    fireEvent.click(end);

    expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("6 days selected");
  });

  it("extends a shift-click selection across employees as a block", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByRole("button", { name: "Angela Santos, Monday 5: not scheduled" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "Carlos Villanueva, Tuesday 6: not scheduled" }));
    await user.keyboard("{/Shift}");

    expect(screen.getByTestId("schedule-selection-count")).toHaveTextContent("4 days selected");
  });

  it("applies a shift in one click, keeping each day's project", async () => {
    const user = userEvent.setup();
    renderGrid();

    await selectWholeDay(user, "2026-10-01");
    await user.click(await screen.findByRole("button", { name: "Apply D · Day" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).entries).toEqual([
      { employeeId: "e1", date: "2026-10-01", shiftTemplateId: "s1", projectId: "p1" },
      { employeeId: "e2", date: "2026-10-01", shiftTemplateId: "s1" },
    ]);
  });

  it("filters the roster by name or employee number", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.type(screen.getByRole("searchbox", { name: "Find employee" }), "emp-002");
    expect(screen.queryByTestId("schedule-row-e1")).not.toBeInTheDocument();
    expect(screen.getByTestId("schedule-row-e2")).toBeInTheDocument();
  });

  it("explains how to start when no shifts exist yet", () => {
    renderGrid({ shifts: [] });
    expect(screen.getByText(/Add shifts first/)).toBeInTheDocument();
  });

  describe("day details", () => {
    const DAY_INFO = {
      "2026-10-05": {
        holidays: [{ id: "h1", date: "2026-10-05", name: "Founders Day", type: "special_non_working" as const, scope: "Cebu City", source: "City Ordinance 123", presetKey: null }],
        events: [{ id: "ev1", title: "Town hall", time: "09:00", category: "meeting" }],
        note: "Skeleton crew only",
      },
    };

    it("marks holidays and notes on the date and opens that day's holidays, head-count, events and note", async () => {
      const user = userEvent.setup();
      renderGrid({ dayInfo: DAY_INFO, canReadEvents: true });

      const date = screen.getByTestId("schedule-day-2026-10-05");
      expect(within(date).getByTestId("schedule-holiday-marker")).toBeInTheDocument();
      expect(within(date).getByTestId("schedule-note-marker")).toBeInTheDocument();
      expect(date).toHaveAccessibleName(/Founders Day \(Special non-working day\)/);

      await user.click(date);
      const dialog = await screen.findByTestId("day-details-dialog");
      expect(within(dialog).getByText("Monday, October 5, 2026")).toBeInTheDocument();
      expect(within(dialog).getByText("Founders Day")).toBeInTheDocument();
      expect(within(dialog).getByText("Special non-working day")).toBeInTheDocument();
      expect(within(dialog).getByText("Cebu City")).toBeInTheDocument();
      expect(within(dialog).getByText("Town hall")).toBeInTheDocument();
      expect(within(dialog).getByTestId("day-details-note-input")).toHaveValue("Skeleton crew only");
      // Neither Angela nor Carlos is scheduled on the 5th.
      expect(within(screen.getByTestId("day-details-headcount")).getByText("Not scheduled").nextSibling).toHaveTextContent("2");
    });

    it("counts who's working that day by shift", async () => {
      const user = userEvent.setup();
      renderGrid();
      await user.click(screen.getByTestId("schedule-day-2026-10-01"));
      const headcount = within(await screen.findByTestId("day-details-headcount"));
      expect(headcount.getByText("Working").nextSibling).toHaveTextContent("1");
      expect(headcount.getByText("Not scheduled").nextSibling).toHaveTextContent("1");
    });

    it("saves HR's note for the day", async () => {
      const user = userEvent.setup();
      renderGrid({ dayInfo: DAY_INFO });
      await user.click(screen.getByTestId("schedule-day-2026-10-05"));
      const input = await screen.findByTestId("day-details-note-input");
      await user.clear(input);
      await user.type(input, "Typhoon signal no. 2");
      await user.click(screen.getByTestId("day-details-note-save"));

      await waitFor(() => expect(refresh).toHaveBeenCalled());
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/attendance/day-notes");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", date: "2026-10-05", note: "Typhoon signal no. 2" });
    });

    it("shows the day read-only without edit permission, hiding company events without access", async () => {
      const user = userEvent.setup();
      renderGrid({ canUpdate: false, dayInfo: DAY_INFO, canReadEvents: false });
      await user.click(screen.getByTestId("schedule-day-2026-10-05"));
      const dialog = await screen.findByTestId("day-details-dialog");
      expect(within(dialog).getByText("Skeleton crew only")).toBeInTheDocument();
      expect(within(dialog).queryByTestId("day-details-note-input")).not.toBeInTheDocument();
      expect(within(dialog).queryByTestId("day-details-select-day")).not.toBeInTheDocument();
      expect(within(dialog).queryByTestId("day-details-add-holiday")).not.toBeInTheDocument();
      expect(within(dialog).queryByTestId("day-details-events")).not.toBeInTheDocument();
    });
  });
});
