// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleDialog } from "@/app/(app)/payroll/schedules/schedule-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ schedule: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

const setupUser = () => userEvent.setup({ pointerEventsCheck: 0 });
const lastBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

// Payroll plan Phase 6: every frequency is offered; bi-weekly takes an anchor date, monthly needs the acknowledgement.
describe("ScheduleDialog pay frequency", () => {
  async function newSchedule(frequency: string) {
    const user = setupUser();
    render(<ScheduleDialog organizationId="org1" projects={[]} />);
    await user.click(screen.getByTestId("payroll-schedule-create"));
    await user.type(screen.getByLabelText(/^Name/), "Crew");
    await user.click(screen.getByLabelText(/Pay frequency/));
    await user.click(await screen.findByRole("option", { name: frequency }));
    return user;
  }

  it("sends a bi-weekly schedule with its anchor date and the anchor's weekday as the cutoff", async () => {
    const user = await newSchedule("Bi-weekly");
    fireEvent.change(screen.getByTestId("schedule-anchor-date"), { target: { value: "2026-11-13" } });
    await user.click(screen.getByTestId("payroll-schedule-save"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ payFrequency: "bi-weekly", anchorDate: "2026-11-13", cutoffDay: 5 });
  });

  it("asks for the acknowledgement on monthly", async () => {
    const user = await newSchedule("Monthly");
    await user.click(screen.getByTestId("payroll-schedule-save"));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("schedule-monthly-notice-acknowledge"));
    await user.click(screen.getByTestId("payroll-schedule-save"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ payFrequency: "monthly", acknowledgeMonthlyPay: true });
  });

  it("doesn't ask again for a monthly schedule that already has the acknowledgement", async () => {
    const user = setupUser();
    render(
      <ScheduleDialog
        organizationId="org1"
        projects={[]}
        schedule={{ id: "s1", name: "Old", projectId: "", payFrequency: "monthly", cutoffDay: 31, payDateOffsetDays: 5, autoPrepare: true, status: "active", monthlyAcknowledged: true }}
      />,
    );
    await user.click(screen.getByTestId("payroll-schedule-edit"));
    expect(screen.queryByTestId("schedule-monthly-notice")).toBeNull();
    await user.click(screen.getByTestId("payroll-schedule-save"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastBody()).not.toHaveProperty("acknowledgeMonthlyPay");
  });
});
