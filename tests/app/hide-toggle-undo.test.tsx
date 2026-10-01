// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HideToggle } from "@/components/shared/hide-toggle";

const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => success(...args), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("HideToggle undo", () => {
  beforeEach(() => success.mockReset());

  it("offers Undo after hiding, which unhides it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    render(<HideToggle organizationId="org1" type="project" id="p1" label="Test Project" hidden={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Hide Test Project from everyone else" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    const [title, options] = success.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(title).toBe("Test Project is hidden");
    expect(options.action.label).toBe("Undo");

    options.action.onClick();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ id: "p1", hidden: false });
    await waitFor(() => expect(success).toHaveBeenLastCalledWith("Test Project is visible again"));
  });
});
