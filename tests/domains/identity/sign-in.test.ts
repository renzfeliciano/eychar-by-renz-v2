import { describe, it, expect, beforeEach } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { signInWithPassword } from "@/domains/identity/sign-in";
import { MAX_FAILED_SIGN_INS } from "@/domains/identity/login-guard";
import { MfaService } from "@/domains/identity/mfa-service";
import { generateTotp, TOTP_STEP_SECONDS } from "@/server/auth/totp";

const PASSWORD = "harbor-lantern-73-mango";
const ip = () => `192.0.2.${Math.floor(Math.random() * 250)}-${Date.now()}-${Math.random()}`;

async function makeUser(extra: Record<string, unknown> = {}) {
  const username = `signin.${Date.now()}.${Math.random()}`.replace(/\s/g, "");
  const user = await UserModel.create({ username, passwordHash: await argon2.hash(PASSWORD), ...extra });
  return { user, username };
}

describe("signInWithPassword", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("signs in with the right password", async () => {
    const { user, username } = await makeUser();
    const result = await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() });
    expect(result).toMatchObject({ ok: true, userId: user._id.toString(), mustChangePassword: false });
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    const { username } = await makeUser();
    expect(await signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: ip() })).toEqual({ ok: false, reason: "invalid" });
    expect(await signInWithPassword({ login: "nobody-by-this-name", password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "invalid" });
  });

  it("locks after repeated wrong passwords, even when the right one comes next", async () => {
    const { username } = await makeUser();
    const results = [];
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS; attempt += 1) results.push(await signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: ip() }));
    expect(results.at(-1)).toEqual({ ok: false, reason: "locked" });
    expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "locked" });
  });

  it("refuses disabled accounts like unknown ones", async () => {
    const { username } = await makeUser({ status: "disabled" });
    expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "invalid" });
  });

  it("asks for the second step when two-factor sign-in is on, and checks the code", async () => {
    const { user, username } = await makeUser();
    const enrolledAt = new Date(Date.now() - 10 * TOTP_STEP_SECONDS * 1000);
    const { secret } = await MfaService.startEnrollment(user._id.toString());
    await MfaService.confirmEnrollment(user._id.toString(), generateTotp(secret, enrolledAt), { now: enrolledAt });

    expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toEqual({ ok: false, reason: "mfa_required" });
    expect(await signInWithPassword({ login: username, password: PASSWORD, otp: "000000" }, { ip: ip() })).toEqual({ ok: false, reason: "invalid_otp" });
    const now = new Date();
    expect(await signInWithPassword({ login: username, password: PASSWORD, otp: generateTotp(secret, now) }, { ip: ip(), now })).toMatchObject({ ok: true });
  });

  it("says when the network has made too many attempts", async () => {
    const { username } = await makeUser();
    const shared = ip();
    let last;
    for (let attempt = 0; attempt < 31; attempt += 1) last = await signInWithPassword({ login: username, password: "wrong-password-here" }, { ip: shared });
    expect(last).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("flags accounts that must choose a new password", async () => {
    const { username } = await makeUser({ mustChangePassword: true });
    expect(await signInWithPassword({ login: username, password: PASSWORD }, { ip: ip() })).toMatchObject({ ok: true, mustChangePassword: true });
  });
});
