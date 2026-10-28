// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvaluationFollowUpDialog } from "@/app/(app)/dashboard/evaluation-follow-up-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const success = vi.fn();
const error = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args), error: (...args: unknown[]) => error(...args) } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  success.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ followUp: { id: "f1", outcome: "sent" } }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

const props = { organizationId: "org1", employeeId: "e1", employeeName: "Debbie Abellara", dueKey: "2026-11-12", todayKey: "2026-10-28" };

describe("EvaluationFollowUpDialog", () => {
  it("records who it was sent to and when, then offers Undo", async () => {
    const user = userEvent.setup();
    render(<EvaluationFollowUpDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /Mark sent/ }));
    fireEvent.change(screen.getByLabelText(/Sent on/), { target: { value: "2026-10-01" } });
    await user.type(screen.getByLabelText(/^Sent to$/), "Engr. Santos");
    await user.type(screen.getByLabelText(/Remarks/), "Sent via email");
    await user.click(screen.getByTestId("evaluation-follow-up-submit"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ organizationId: "org1", employeeId: "e1", dueKey: "2026-11-12", outcome: "sent", actionDate: "2026-10-01", sentTo: "Engr. Santos", remarks: "Sent via email" });
    const [title, options] = success.mock.calls[0];
    expect(title).toBe("Marked Debbie Abellara's evaluation as sent");

    // Undo withdraws it and brings the row back.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await options.action.onClick();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/evaluation-follow-ups/f1");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
    expect(success).toHaveBeenLastCalledWith("Debbie Abellara's evaluation is back on the list");
  });

  it("records a completed evaluation without a recipient", async () => {
    const user = userEvent.setup();
    render(<EvaluationFollowUpDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /Mark sent/ }));
    await user.click(screen.getByLabelText(/Evaluation completed/));
    expect(screen.queryByLabelText(/^Sent to$/)).toBeNull();
    await user.click(screen.getByTestId("evaluation-follow-up-submit"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ outcome: "completed", actionDate: "2026-10-28" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sentTo).toBeUndefined();
  });

  it("keeps the dialog open with the server's reason when saving fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Employee not found in this organization" }), { status: 404 }));
    const user = userEvent.setup();
    render(<EvaluationFollowUpDialog {...props} />);

    await user.click(screen.getByRole("button", { name: /Mark sent/ }));
    await user.click(screen.getByTestId("evaluation-follow-up-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Employee not found");
    expect(refresh).not.toHaveBeenCalled();
  });
});
