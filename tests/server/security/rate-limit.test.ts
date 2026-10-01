import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { RateLimitError } from "@/shared/errors";
import { toErrorResponse } from "@/shared/errors/to-response";

describe("enforceRateLimit", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("allows up to the limit per user, then refuses with a 429 and Retry-After", async () => {
    const userId = new Types.ObjectId().toString();
    const now = new Date("2026-10-02T01:00:00.000Z");
    for (let i = 0; i < RATE_LIMITS.payrollRun.limit; i += 1) await enforceRateLimit("payrollRun", userId, now);

    const error = await enforceRateLimit("payrollRun", userId, now).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    const response = toErrorResponse(error);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);

    // Someone else isn't affected, and the window resets later.
    await expect(enforceRateLimit("payrollRun", new Types.ObjectId().toString(), now)).resolves.toBeUndefined();
    await expect(enforceRateLimit("payrollRun", userId, new Date(now.getTime() + RATE_LIMITS.payrollRun.windowMs + 1))).resolves.toBeUndefined();
  });
});

describe("password confirmations", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("stop accepting guesses from one session after the limit, even a correct password", async () => {
    const { default: argon2 } = await import("argon2");
    const { confirmAccountPassword } = await import("@/domains/identity/confirm-password");
    const userId = new Types.ObjectId().toString();
    const hash = await argon2.hash("harbor-lantern-73-mango");

    for (let i = 0; i < RATE_LIMITS.passwordCheck.limit; i += 1) {
      await expect(confirmAccountPassword(userId, hash, `wrong-${i}`)).rejects.toThrow(/incorrect/);
    }
    await expect(confirmAccountPassword(userId, hash, "harbor-lantern-73-mango")).rejects.toBeInstanceOf(RateLimitError);
  });
});
