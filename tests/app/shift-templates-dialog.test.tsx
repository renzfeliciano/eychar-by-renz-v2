// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShiftTemplatesDialog, formatHours } from "@/app/(app)/attendance/schedules/shift-templates-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const DAY = { id: "s1", name: "Day", code: "D", kind: "work" as const, pattern: "fixed" as const, color: "blue", startTime: "08:00", endTime: "17:00", latestStartTime: null, requiredHours: null, status: "active" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ shift: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("ShiftTemplatesDialog", () => {
  it("pre-selects the next unused color for a new shift and lets HR pick another", async () => {
    const user = userEvent.setup();
    render(<ShiftTemplatesDialog organizationId="org1" shifts={[DAY]} />);
    await user.click(screen.getByTestId("schedule-shifts-button"));

    const palette = screen.getByRole("radiogroup", { name: "Shift color" });
    expect(palette.querySelector('[aria-checked="true"]')).toHaveAccessibleName("Teal");

    await user.click(screen.getByRole("radio", { name: "Rose" }));
    await user.type(screen.getByLabelText(/^Name/), "Mid");
    await user.type(screen.getByLabelText(/^Code/), "m");
    await user.click(screen.getByTestId("shift-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ code: "M", color: "rose", pattern: "fixed", startTime: "08:00", endTime: "17:00" });
  });

  it("creates a flexi shift with a start window and hours instead of an end time", async () => {
    const user = userEvent.setup();
    render(<ShiftTemplatesDialog organizationId="org1" shifts={[]} />);
    await user.click(screen.getByTestId("schedule-shifts-button"));

    await user.type(screen.getByLabelText(/^Name/), "Flexi");
    await user.type(screen.getByLabelText(/^Code/), "fx");
    await user.click(screen.getByRole("radio", { name: "Flexi-time" }));
    fireEvent.change(screen.getByLabelText(/Earliest start/), { target: { value: "07:00" } });
    fireEvent.change(screen.getByLabelText(/Latest start/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/Hours to work/), { target: { value: "8" } });
    await user.click(screen.getByTestId("shift-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ pattern: "flexible", startTime: "07:00", latestStartTime: "10:00", requiredHours: 8 });
    expect(body.endTime).toBeUndefined();
  });

  it("describes flexi and fixed hours in the list", () => {
    expect(formatHours({ kind: "work", pattern: "flexible", startTime: "07:00", endTime: null, latestStartTime: "10:00", requiredHours: 8 })).toBe("Flexi: start 07:00–10:00, 8h");
    expect(formatHours(DAY)).toBe("08:00–17:00");
  });
});
