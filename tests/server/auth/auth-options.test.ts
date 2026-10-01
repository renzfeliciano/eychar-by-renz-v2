import { describe, it, expect, beforeEach } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { authOptions } from "@/server/auth/options";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";

type JwtArgs = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["jwt"]>>[0];
type SessionArgs = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["session"]>>[0];
const jwt = (token: JWT, extra: Partial<JwtArgs> = {}) => authOptions.callbacks!.jwt!({ token, ...extra } as JwtArgs);
const toSession = async (token: JWT) =>
  (await authOptions.callbacks!.session!({ session: { user: {}, expires: "" } as Session, token } as SessionArgs)) as Session;

async function signedInUser(extra: Record<string, unknown> = {}) {
  const user = await UserModel.create({ username: `opt.${Date.now()}.${Math.random()}`, passwordHash: "x", activeSessionId: "session-1", ...extra });
  const now = Date.now();
  const token: JWT = { userId: user._id.toString(), sessionId: "session-1", lastActivityAt: now, signedInAt: now, idleMs: 30 * 60_000, expired: false };
  return { userId: user._id.toString(), token };
}

describe("the session token", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("carries mustChangePassword, re-read from the account on every request", async () => {
    const { userId, token } = await signedInUser({ mustChangePassword: true });
    let next = await jwt(token);
    expect(next.mustChangePassword).toBe(true);
    expect((await toSession(next)).mustChangePassword).toBe(true);

    await UserModel.updateOne({ _id: userId }, { $set: { mustChangePassword: false } });
    next = await jwt(next);
    expect(next.mustChangePassword).toBe(false);
    expect((await toSession(next)).mustChangePassword).toBeUndefined();
  });

  it("drops the hidden-data view as soon as the Super Administrator role is lost", async () => {
    const { userId, token } = await signedInUser();
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-opt-${Date.now()}-${Math.random()}` });
    await SuperAdminService.ensure(organization._id.toString(), userId);
    expect((await jwt(token)).seesHidden).toBe(true);

    await RoleAssignmentModel.updateMany({ userId }, { $set: { effectiveTo: new Date(Date.now() - 1000) } });
    expect((await jwt(token)).seesHidden).toBe(false);
  });

  it("ends the session past the absolute lifetime, however active it is", async () => {
    const { token } = await signedInUser();
    const next = await jwt({ ...token, signedInAt: Date.now() - 13 * 60 * 60_000, seesHidden: true });
    expect(next.expired).toBe(true);
    expect(next.seesHidden).toBe(false);
    expect((await toSession(next)).error).toBe("SessionExpired");
  });

  it("dies when the password is changed or the account signs out", async () => {
    const { userId, token } = await signedInUser();
    expect((await jwt(token)).expired).toBe(false);

    await authOptions.events!.signOut!({ token, session: undefined as never });
    expect((await UserModel.findById(userId).lean())!.activeSessionId).toBeFalsy();
    expect((await jwt({ ...token })).expired).toBe(true);
  });

  it("a sign-out from an older session leaves the newer one alone", async () => {
    const { userId, token } = await signedInUser();
    await authOptions.events!.signOut!({ token: { ...token, sessionId: "older-session" }, session: undefined as never });
    expect((await UserModel.findById(userId).lean())!.activeSessionId).toBe("session-1");
  });
});
