// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePolicyDialog } from "@/app/(app)/attendance/policies/create-policy-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ policy: {} }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

async function openAndName() {
  const user = userEvent.setup();
  render(<CreatePolicyDialog organizationId="org1" projects={[]} />);
  await user.click(screen.getByTestId("attendance-policies-create-button"));
  await user.type(screen.getByLabelText(/^Name/), "Standard");
  return user;
}

describe("CreatePolicyDialog time rules (plan Phase 2)", () => {
  it("leaves the time rules out when HR doesn't fill them, so the defaults apply", async () => {
    const user = await openAndName();
    expect(screen.getByLabelText(/Night starts/)).toHaveAttribute("placeholder", "22:00");
    await user.click(screen.getByTestId("attendance-policies-create-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("breakMinutes");
    expect(body).not.toHaveProperty("roundingMinutes");
    expect(body).not.toHaveProperty("nightStartTime");
    expect(body).not.toHaveProperty("nightEndTime");
  });

  it("sends the break, rounding and night window HR sets", async () => {
    const user = await openAndName();
    fireEvent.change(screen.getByLabelText(/Unpaid break/), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/Round to/), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText(/Night starts/), { target: { value: "21:00" } });
    fireEvent.change(screen.getByLabelText(/Night ends/), { target: { value: "05:00" } });
    await user.click(screen.getByTestId("attendance-policies-create-submit-button"));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ breakMinutes: 60, roundingMinutes: 15, nightStartTime: "21:00", nightEndTime: "05:00" });
  });
});
