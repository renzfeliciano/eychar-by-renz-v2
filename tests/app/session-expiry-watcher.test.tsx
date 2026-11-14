// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SessionExpiryWatcher } from "@/components/shared/session-expiry-watcher";

const update = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" }, expires: "" }, status: "authenticated", update: (...args: unknown[]) => update(...args) }),
}));

const originalFetch = window.fetch;
let serverSession: unknown;
let sessionChecks: number;
let api: ReturnType<typeof vi.fn>;
let leave: ReturnType<typeof vi.fn>;

beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue({ user: {}, error: "SessionExpired", expires: "" });
  leave = vi.fn();
  sessionChecks = 0;
  serverSession = { error: "SessionExpired", user: {}, expires: "" };
  api = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/auth/session")) {
      sessionChecks += 1;
      if (serverSession === "network-down") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(serverSession), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "Your session has ended. Sign in again to continue." }), { status: 401 });
  });
  window.fetch = api as unknown as typeof window.fetch;
  window.history.pushState({}, "", "/people/abc");
});

afterEach(() => {
  window.fetch = originalFetch;
});

const rejectedCall = () => window.fetch("/api/evaluation-follow-ups", { method: "POST", body: "{}" });

describe("SessionExpiryWatcher", () => {
  it("when the server has ended the session, hands the state to the existing sign-out notices instead of leaving the form with a bare error", async () => {
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(leave).not.toHaveBeenCalled();
  });

  it("leaves for the sign-in page when there is no session at all (the cookie is gone or invalid)", async () => {
    serverSession = {};
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await waitFor(() => expect(leave).toHaveBeenCalledWith("/login?reason=expired"));
    expect(update).not.toHaveBeenCalled();
  });

  it("does nothing when the session is in fact still good, so a stray 401 never signs anyone out", async () => {
    serverSession = { user: { id: "u1" }, expires: "" };
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await waitFor(() => expect(sessionChecks).toBe(1));
    expect(update).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it("does nothing when it can't reach the server to check (offline is not 'signed out')", async () => {
    serverSession = "network-down";
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await waitFor(() => expect(sessionChecks).toBe(1));
    expect(update).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it("checks once however many calls are refused at the same moment", async () => {
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await Promise.all([rejectedCall(), rejectedCall(), rejectedCall()]);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(sessionChecks).toBe(1);
  });

  it("falls back to the sign-in page if the page's own session state can't be refreshed", async () => {
    update.mockResolvedValue(undefined);
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await waitFor(() => expect(leave).toHaveBeenCalledWith("/login?reason=expired"));
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("does not bounce a person who is already on the sign-in page", async () => {
    window.history.pushState({}, "", "/login");
    serverSession = {};
    render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    await rejectedCall();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(leave).not.toHaveBeenCalled();
    expect(sessionChecks).toBe(0);
  });

  it("stops watching when the page unmounts, and puts fetch back", async () => {
    const view = render(<SessionExpiryWatcher onLeave={leave} retryDelayMs={1} />);
    view.unmount();
    expect(window.fetch).toBe(api);

    await rejectedCall();
    expect(sessionChecks).toBe(0);
  });
});
