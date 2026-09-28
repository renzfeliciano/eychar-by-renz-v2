// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";

const update = vi.fn();
let sessionData: Record<string, unknown> | null = null;
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: sessionData, update }), signOut: vi.fn() }));

beforeEach(() => {
  update.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T10:00:00.000Z"));
});

describe("ConcurrentSessionGuard", () => {
  it("tells a fresh sign-in that the account's other live session was signed out, and acknowledges it once", async () => {
    sessionData = { user: { id: "u1" }, replacedSessionAt: "2026-09-29T09:55:00.000Z" };
    render(<ConcurrentSessionGuard />);

    expect(screen.getByRole("dialog")).toHaveTextContent("Signed out on your other device");
    expect(screen.getByRole("dialog")).toHaveTextContent("last active 5 minutes ago");
    expect(screen.getByRole("dialog")).toHaveTextContent(/If this wasn.t you, change your password/);

    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(update).toHaveBeenCalledWith({ acknowledgeReplacedSession: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still explains an ended session on the device that was signed out", () => {
    sessionData = { user: { id: "u1" }, error: "ConcurrentSessionError" };
    render(<ConcurrentSessionGuard />);

    expect(screen.getByRole("dialog")).toHaveTextContent("Signed in elsewhere");
  });

  it("shows nothing for an ordinary session", () => {
    sessionData = { user: { id: "u1" } };
    render(<ConcurrentSessionGuard />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
