import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { signInWithPassword } from "@/domains/identity/sign-in";
import { LoginGuard, MAX_FAILED_SIGN_INS, clientIp } from "@/domains/identity/login-guard";
import { MfaService } from "@/domains/identity/mfa-service";
import { generateTotp, TOTP_STEP_SECONDS } from "@/server/auth/totp";

const PASSWORD = "harbor-lantern-73-mango";
const ip = () => `198.18.${Math.floor(Math.random() * 250)}.${Date.now()}-${Math.random()}`;

async function makeUser() {
  const username = `race.${Date.now()}.${Math.random()}`;
  const user = await UserModel.create({ username, passwordHash: await argon2.hash(PASSWORD) });
  return { userId: user._id.toString(), username };
}

// FerretDB (the in-container test server) runs findAndModify as an unisolated
// read-then-write, so it loses concurrent $inc updates; real MongoDB updates a
// single document atomically. The truly parallel test runs only on MongoDB;
// the deterministic tests below pin down the same property everywhere.
const onFerretDb = process.env.MONGODB_URI === "mongodb://127.0.0.1:27017/eychar_test";

describe("sign-in under parallel guessing", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("counts the attempt before the slow password check", async () => {
    const { username } = await makeUser();
    const order: string[] = [];
    const reserve = vi.spyOn(LoginGuard, "reserveAttempt").mockImplementation(async () => {
      order.push("reserve");
      return 1;
    });
    const verify = vi.spyOn(argon2, "verify").mockImplementation(async () => {
      order.push("verify");
      return false;
    });
    try {
      await signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: ip() });
    } finally {
      reserve.mockRestore();
      verify.mockRestore();
    }
    expect(order).toEqual(["reserve", "verify"]);
  });

  it("gives out at most the limit of attempts, then none until the lock ends", async () => {
    const { userId } = await makeUser();
    const reservations = [];
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS + 2; attempt += 1) reservations.push(await LoginGuard.reserveAttempt(userId));
    expect(reservations).toEqual([...Array.from({ length: MAX_FAILED_SIGN_INS }, (_, index) => index + 1), null, null]);
  });

  it("refuses even the right password while the remaining attempts are all in flight", async () => {
    const { userId, username } = await makeUser();
    // As if MAX_FAILED_SIGN_INS guesses had reserved their attempts and were still hashing.
    await UserModel.updateOne({ _id: userId }, { $set: { failedSignInCount: MAX_FAILED_SIGN_INS } });
    expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "locked" });
  });

  it.skipIf(onFerretDb)("can't get more than the limit of guesses past the lock, however many run at once", async () => {
    const { userId, username } = await makeUser();
    const attempts = MAX_FAILED_SIGN_INS * 3;
    const results = await Promise.all(Array.from({ length: attempts }, () => signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: ip() })));
    expect(results.filter((result) => !result.ok && result.reason === "invalid").length).toBeLessThanOrEqual(MAX_FAILED_SIGN_INS - 1);
    expect(LoginGuard.isLocked((await UserModel.findById(userId).lean())!)).toBe(true);
  }, 30_000);

  it("counts wrong two-step codes against the same limit, but not the password step that asks for one", async () => {
    const { userId, username } = await makeUser();
    const enrolledAt = new Date(Date.now() - 10 * TOTP_STEP_SECONDS * 1000);
    const { secret } = await MfaService.startEnrollment(userId);
    await MfaService.confirmEnrollment(userId, generateTotp(secret, enrolledAt), { now: enrolledAt });

    for (let step = 0; step < MAX_FAILED_SIGN_INS + 2; step += 1) {
      expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "mfa_required" });
    }
    expect((await UserModel.findById(userId).lean())!.failedSignInCount).toBe(0);

    const results = [];
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS; attempt += 1) results.push(await signInWithPassword({ login: username, password: PASSWORD, otp: "000000" }, { ip: ip() }));
    expect(results.map((result) => (result.ok ? "ok" : result.reason))).toEqual([...Array(MAX_FAILED_SIGN_INS - 1).fill("invalid_otp"), "locked"]);
    expect(await signInWithPassword({ login: username, password: PASSWORD, otp: generateTotp(secret) }, { ip: ip() })).toEqual({ ok: false, reason: "locked" });
  }, 30_000);
});

describe("sign-in never reveals which usernames exist", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("an unknown username reports locked after the same number of failures as a real one", async () => {
    const { username } = await makeUser();
    const unknown = `nobody.${Date.now()}.${Math.random()}`;
    const real: string[] = [];
    const fake: string[] = [];
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS + 1; attempt += 1) {
      const a = await signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: ip() });
      const b = await signInWithPassword({ login: unknown.toUpperCase(), password: "wrong-password-here" }, { ip: ip() });
      real.push(a.ok ? "ok" : a.reason);
      fake.push(b.ok ? "ok" : b.reason);
    }
    expect(fake).toEqual(real);
    expect(real.at(-1)).toBe("locked");
  }, 30_000);
});

describe("clientIp", () => {
  const saved = { hops: process.env.TRUSTED_PROXY_HOPS, vercel: process.env.VERCEL };
  afterEach(() => {
    process.env.TRUSTED_PROXY_HOPS = saved.hops;
    process.env.VERCEL = saved.vercel;
    if (saved.hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    if (saved.vercel === undefined) delete process.env.VERCEL;
  });

  it("ignores a spoofed first X-Forwarded-For entry and takes the one the proxy added", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4,  203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("skips the entries added by extra trusted proxies", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 10.0.0.2" })).toBe("203.0.113.9");
  });

  it("prefers Vercel's own header on Vercel, and falls back to X-Real-IP", () => {
    process.env.VERCEL = "1";
    expect(clientIp({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.2.3.4" })).toBe("198.51.100.4");
    delete process.env.VERCEL;
    expect(clientIp({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.2.3.4" })).toBe("1.2.3.4");
    expect(clientIp({ "x-real-ip": "192.0.2.8" })).toBe("192.0.2.8");
    expect(clientIp(undefined)).toBe("unknown");
  });
});
