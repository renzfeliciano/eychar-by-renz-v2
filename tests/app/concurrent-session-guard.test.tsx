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

    expect(screen.getByRole("dialog")).toHaveTextContent("Signed in on another device or browser");
  });

  it("says when and where the other sign-in happened, so people can tell it was them", () => {
    sessionData = {
      user: { id: "u1" },
      error: "ConcurrentSessionError",
      replacedBy: { at: "2026-09-29T09:58:00.000Z", device: "Chrome on Windows", host: "localhost:4100" },
    };
    render(<ConcurrentSessionGuard />);

    const details = screen.getByTestId("session-replaced-details");
    expect(details).toHaveTextContent("Chrome on Windows");
    expect(details).toHaveTextContent("localhost:4100");
    expect(details).toHaveTextContent("2 minutes ago");
    expect(screen.getByRole("dialog")).toHaveTextContent(/local copy of the app \(localhost\)/);
  });

  it("doesn't claim a sign-in elsewhere when the session was simply signed out", () => {
    sessionData = { user: { id: "u1" }, error: "SessionEnded" };
    render(<ConcurrentSessionGuard />);

    expect(screen.getByRole("dialog")).toHaveTextContent("This session was signed out");
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/another device/);
  });

  it("shows nothing for an ordinary session", () => {
    sessionData = { user: { id: "u1" } };
    render(<ConcurrentSessionGuard />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
