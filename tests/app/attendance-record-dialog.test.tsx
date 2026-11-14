// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordDialog } from "@/app/(app)/attendance/record-dialog";
import { RecalculateDialog } from "@/app/(app)/attendance/recalculate-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ scanned: 3, changed: 1 }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

const measured = { workedMinutes: 600, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 120, nightDiffMinutes: 30, dayType: "regular_holiday", flags: ["overtime_unapproved"] };

function renderDialog(props: Partial<Parameters<typeof RecordDialog>[0]> = {}) {
  return render(
    <RecordDialog
      organizationId="org1"
      employeeId="emp1"
      date="2026-10-05"
      existingRecordId="rec1"
      initialCheckInAt="2026-10-05T00:00:00.000Z"
      initialCheckOutAt="2026-10-05T11:00:00.000Z"
      initialStatus="present"
      statusOptions={[{ id: "present", label: "Present" }]}
      measured={measured}
      overtimeApproved={false}
      canApproveOvertime
      {...props}
    />,
  );
}

describe("RecordDialog measured day (attendance plan Phase 6)", () => {
  it("shows what was measured and sends an overtime approval", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("attendance-adjust-button"));

    expect(screen.getByText("Regular holiday")).toBeInTheDocument();
    expect(screen.getByText("10h")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Approve 2h of overtime/ }));
    await user.click(screen.getByTestId("attendance-record-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ overtimeApproved: true });
  });

  it("leaves the approval out when it isn't changed", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("attendance-adjust-button"));
    await user.click(screen.getByTestId("attendance-record-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("overtimeApproved");
  });

  it("offers no approval without overtime, or without the permission", async () => {
    const user = userEvent.setup();
    const { unmount } = renderDialog({ measured: { ...measured, overtimeMinutes: 0, flags: [] } });
    await user.click(screen.getByTestId("attendance-adjust-button"));
    expect(screen.queryByLabelText(/overtime/i)).not.toBeInTheDocument();
    unmount();

    renderDialog({ canApproveOvertime: false });
    await user.click(screen.getByTestId("attendance-adjust-button"));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("RecordDialog night shifts (final review)", () => {
  // 22:00 Oct 5 to 06:00 Oct 6, Manila.
  const overnight = { initialCheckInAt: "2026-10-05T14:00:00.000Z", initialCheckOutAt: "2026-10-05T22:00:00.000Z" };

  it("approving overtime sends no times, so an overnight check-out isn't moved", async () => {
    const user = userEvent.setup();
    renderDialog(overnight);
    await user.click(screen.getByTestId("attendance-adjust-button"));
    await user.click(screen.getByRole("checkbox", { name: /Approve 2h of overtime/ }));
    await user.click(screen.getByTestId("attendance-record-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ overtimeApproved: true });
    expect(body).not.toHaveProperty("checkInAt");
    expect(body).not.toHaveProperty("checkOutAt");
  });

  it("a check-out at or before the check-in is the next morning", async () => {
    const user = userEvent.setup();
    renderDialog(overnight);
    await user.click(screen.getByTestId("attendance-adjust-button"));
    fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "07:00" } });
    await user.click(screen.getByTestId("attendance-record-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).checkOutAt).toBe("2026-10-05T23:00:00.000Z");
  });
});

describe("RecalculateDialog (attendance plan Phase 6)", () => {
  it("recalculates the chosen range", async () => {
    const user = userEvent.setup();
    render(<RecalculateDialog organizationId="org1" date="2026-10-05" />);
    await user.click(screen.getByTestId("attendance-recalculate-button"));
    await user.click(screen.getByTestId("attendance-recalculate-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/attendance/recalculate");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", from: "2026-10-05", to: "2026-10-05" });
  });
});
