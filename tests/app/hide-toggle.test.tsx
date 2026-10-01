// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HideToggle } from "@/components/shared/hide-toggle";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ hidden: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("HideToggle", () => {
  it("hides a visible record from everyone else", async () => {
    const user = userEvent.setup();
    render(<HideToggle organizationId="org1" type="location" id="l1" label="Test Location" hidden={false} />);

    await user.click(screen.getByRole("button", { name: "Hide Test Location from everyone else" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/visibility");
    expect(JSON.parse(init.body)).toEqual({ organizationId: "org1", type: "location", id: "l1", hidden: true });
  });

  it("shows a hidden record as hidden, and unhides it", async () => {
    const user = userEvent.setup();
    render(<HideToggle organizationId="org1" type="location" id="l1" label="Test Location" hidden />);

    expect(screen.getByText("Hidden")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unhide Test Location" }));

    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0][1].body).hidden).toBe(false));
  });
});
