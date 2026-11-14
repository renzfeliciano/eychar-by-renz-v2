// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installSessionExpiryInterceptor } from "@/lib/session-expiry-interceptor";

const originalFetch = window.fetch;
let respond: ReturnType<typeof vi.fn>;
let uninstall: () => void;
let onRejected: ReturnType<typeof vi.fn>;

beforeEach(() => {
  respond = vi.fn(async () => new Response("{}", { status: 200 }));
  window.fetch = respond as unknown as typeof window.fetch;
  onRejected = vi.fn();
  uninstall = installSessionExpiryInterceptor(onRejected);
});

afterEach(() => {
  uninstall();
  window.fetch = originalFetch;
});

const status = (code: number) => respond.mockResolvedValueOnce(new Response(code === 204 ? null : JSON.stringify({ error: "x" }), { status: code }));

describe("installSessionExpiryInterceptor", () => {
  it("reports a 401 from our own API, once per call", async () => {
    status(401);
    await window.fetch("/api/employees");
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it("hands the original response back untouched, so the form can still read it", async () => {
    status(401);
    const response = await window.fetch("/api/employees", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "x" });
    expect(respond).toHaveBeenCalledWith("/api/employees", { method: "POST", body: "{}" });
  });

  it.each([200, 201, 204, 400, 403, 404, 409, 422, 429, 500])("ignores a %i", async (code) => {
    status(code);
    await window.fetch("/api/employees");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("ignores the sign-in machinery itself, so checking the session can't loop", async () => {
    status(401);
    await window.fetch("/api/auth/session");
    status(401);
    await window.fetch("/api/auth/callback/credentials", { method: "POST" });
    status(401);
    await window.fetch("/api/auth");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("ignores requests that are not ours: another origin, or a page rather than the API", async () => {
    status(401);
    await window.fetch("https://other.example/api/employees");
    status(401);
    await window.fetch("/some/page");
    status(401);
    await window.fetch("/apiary/employees");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("reads the address from a Request or a URL object as well as a string", async () => {
    status(401);
    await window.fetch(new Request(`${window.location.origin}/api/leave-requests`, { method: "POST", body: "{}" }));
    status(401);
    await window.fetch(new URL("/api/leave-requests", window.location.origin));
    expect(onRejected).toHaveBeenCalledTimes(2);
  });

  it("lets a network failure through unchanged and reports nothing", async () => {
    respond.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(window.fetch("/api/employees")).rejects.toThrow("Failed to fetch");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("puts the original fetch back when removed, and stops reporting", async () => {
    uninstall();
    expect(window.fetch).toBe(respond);
    status(401);
    await window.fetch("/api/employees");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("does not wrap twice if installed again, so one 401 is still reported once", async () => {
    const second = vi.fn();
    const removeSecond = installSessionExpiryInterceptor(second);
    status(401);
    await window.fetch("/api/employees");
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    removeSecond();
  });
});
