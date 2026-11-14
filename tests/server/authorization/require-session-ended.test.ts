import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const { requireAuthenticatedUser } = await import("@/server/authorization/require");

async function rejection(): Promise<AuthenticationError> {
  try {
    await requireAuthenticatedUser();
  } catch (error) {
    return error as AuthenticationError;
  }
  throw new Error("expected requireAuthenticatedUser to reject");
}

describe("a request with no live session", () => {
  beforeEach(() => session.mockReset());

  it("is refused with a message a person can act on, not the bare 'Authentication required'", async () => {
    session.mockResolvedValue(null);
    const error = await rejection();
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toMatch(/sign in again/i);
  });

  it.each([
    ["SessionExpired", "expired after inactivity or the session limit"],
    ["SessionEnded", "was ended on purpose"],
    ["ConcurrentSessionError", "was replaced by a sign-in elsewhere"],
  ])("says why when the session %s (%s), so the browser can show the right notice", async (reason) => {
    session.mockResolvedValue({ error: reason, expires: "" });
    const error = await rejection();
    expect(error.details).toEqual({ reason });
  });

  it("reports 'NoSession' when there was no session at all", async () => {
    session.mockResolvedValue(null);
    expect((await rejection()).details).toEqual({ reason: "NoSession" });
  });

  it("reaches the browser as a 401 carrying the reason", async () => {
    session.mockResolvedValue({ error: "SessionExpired", expires: "" });
    const response = toErrorResponse(await rejection());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/sign in again/i);
    expect(body.details).toEqual({ reason: "SessionExpired" });
  });
});
