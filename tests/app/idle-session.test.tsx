// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { idleState, SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-idle";
import { IdleSessionGuard, countdownAnnouncement, forceIdleSignOut, formatCountdown } from "@/components/shared/idle-session-guard";
import { ConcurrentSessionGuard } from "@/components/shared/concurrent-session-guard";

const signOut = vi.fn();
const onSignOut = vi.fn();
let update = vi.fn();
let sessionData: Record<string, unknown> | null = { user: { id: "u1" } };
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: sessionData, update: (...args: unknown[]) => update(...args), status: "authenticated" }), signOut: (...args: unknown[]) => signOut(...args) }));

describe("idleState", () => {
  it("defaults to a 1-minute idle limit with a 15-second warning", () => {
    expect(SESSION_IDLE_MS).toBe(60_000);
    expect(SESSION_IDLE_WARNING_MS).toBe(15_000);
  });

  it("is active, then warning in the last 15 seconds, then expired", () => {
    expect(idleState(0, 30_000)).toEqual({ phase: "active", remainingMs: 30_000 });
    expect(idleState(0, 46_000)).toEqual({ phase: "warning", remainingMs: 14_000 });
    expect(idleState(0, 60_000)).toEqual({ phase: "expired", remainingMs: 0 });
  });
});

describe("IdleSessionGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockReset();
    onSignOut.mockReset();
    update.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("warns 15 seconds before the timeout, counting down, then signs out", () => {
    render(<IdleSessionGuard onSignOut={onSignOut} />);

    act(() => vi.advanceTimersByTime(44_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole("dialog")).toHaveTextContent("Are you still there?");
    expect(screen.getByTestId("idle-countdown")).toHaveTextContent("0:14");

    act(() => vi.advanceTimersByTime(15_000));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when the session refreshes in the background during the warning", () => {
    // next-auth hands out a new session object (and update function) on every
    // background refetch; that used to restart the idle clock at 0:03.
    const { rerender } = render(<IdleSessionGuard onSignOut={onSignOut} />);
    act(() => vi.advanceTimersByTime(56_000));
    expect(screen.getByTestId("idle-countdown")).toHaveTextContent("0:04");

    update = vi.fn();
    sessionData = { user: { id: "u1" }, refreshedAt: Date.now() };
    rerender(<IdleSessionGuard onSignOut={onSignOut} />);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("idle-countdown")).toHaveTextContent("0:03");

    act(() => vi.advanceTimersByTime(4_000));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    sessionData = { user: { id: "u1" } };
  });

  it("keeps the session when the person chooses to stay, and counts activity before the warning", () => {
    render(<IdleSessionGuard onSignOut={onSignOut} />);

    act(() => vi.advanceTimersByTime(40_000));
    fireEvent.keyDown(window, { key: "a" });
    act(() => vi.advanceTimersByTime(40_000));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).toHaveBeenCalled();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});

describe("IdleSessionGuard at zero", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onSignOut.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("stays signed out at zero: the warning doesn't restart, even if another tab records activity", () => {
    render(<IdleSessionGuard onSignOut={onSignOut} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("Signing you out");

    // Activity written by another tab, or a stray mouse move, can't revive it.
    window.localStorage.setItem("eychar:last-activity", String(Date.now()));
    fireEvent.mouseMove(window);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("dialog")).toHaveTextContent("Signing you out");
    expect(screen.getByTestId("idle-stay-button")).toBeDisabled();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("signs out at once when the server says the session already went idle", () => {
    sessionData = { user: { id: "u1" }, error: "SessionExpired" };
    render(<IdleSessionGuard onSignOut={onSignOut} />);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    sessionData = { user: { id: "u1" } };
  });

  it("follows another tab that signed out for inactivity", () => {
    render(<IdleSessionGuard onSignOut={onSignOut} />);
    act(() => vi.advanceTimersByTime(5_000));
    window.localStorage.setItem("eychar:idle-signed-out", String(Date.now()));
    act(() => vi.advanceTimersByTime(1_000));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("forceIdleSignOut", () => {
  afterEach(() => vi.useRealTimers());

  it("goes to the sign-in page after signing out", async () => {
    signOut.mockResolvedValueOnce(undefined);
    const leave = vi.fn();
    await forceIdleSignOut(leave);
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(leave).toHaveBeenCalledWith("/login?reason=idle");
  });

  it("still leaves when the sign-out request fails", async () => {
    signOut.mockRejectedValueOnce(new Error("network"));
    const leave = vi.fn();
    await forceIdleSignOut(leave);
    expect(leave).toHaveBeenCalledWith("/login?reason=idle");
  });

  it("still leaves when the sign-out request hangs", async () => {
    vi.useFakeTimers();
    signOut.mockReturnValueOnce(new Promise(() => undefined));
    const leave = vi.fn();
    const done = forceIdleSignOut(leave);
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(leave).toHaveBeenCalledWith("/login?reason=idle");
  });
});

describe("idle countdown text", () => {
  it("formats the timer and announces only at milestones", () => {
    expect(formatCountdown(12)).toBe("0:12");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(-3)).toBe("0:00");
    expect(countdownAnnouncement(15, 15)).toBe("You'll be signed out in 15 seconds unless you choose to stay signed in.");
    expect(countdownAnnouncement(11, 15)).toBe(countdownAnnouncement(15, 15));
    expect(countdownAnnouncement(10, 15)).toBe("10 seconds left before you're signed out.");
    expect(countdownAnnouncement(7, 15)).toBe(countdownAnnouncement(9, 15));
    expect(countdownAnnouncement(4, 15)).toBe("5 seconds left before you're signed out.");
    expect(countdownAnnouncement(25, 60)).toBe("30 seconds left before you're signed out.");
  });
});

describe("ended session dialog", () => {
  it("can't be dismissed: no close button, and Escape keeps it open", () => {
    sessionData = { user: { id: "u1" }, error: "ConcurrentSessionError" };
    render(<ConcurrentSessionGuard />);

    const dialog = screen.getByRole("dialog");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in again/ })).toBeInTheDocument();
    sessionData = { user: { id: "u1" } };
  });
});
