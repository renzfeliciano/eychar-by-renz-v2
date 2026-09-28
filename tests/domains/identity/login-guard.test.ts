import { describe, it, expect, beforeEach } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, UserModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { LoginGuard, MAX_FAILED_SIGN_INS, LOCK_MINUTES, NETWORK_ATTEMPT_LIMIT } from "@/domains/identity/login-guard";

async function makeUser() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-guard-${Date.now()}-${Math.random()}` });
  const user = await UserModel.create({ username: `guard.${Date.now()}.${Math.random()}`, passwordHash: await argon2.hash("harbor-lantern-73-mango") });
  const role = await RoleService.create({ organizationId: organization._id.toString(), name: "HR", permissionKeys: [], status: "active" }, {});
  await RoleAssignmentService.assign({ organizationId: organization._id.toString(), roleId: role._id.toString(), userId: user._id.toString() }, {});
  return { user, organizationId: organization._id.toString() };
}

describe("LoginGuard", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("locks an account after too many wrong passwords in a row, and records it", async () => {
    const { user, organizationId } = await makeUser();
    const now = new Date("2026-09-28T09:00:00.000Z");

    for (let attempt = 1; attempt < MAX_FAILED_SIGN_INS; attempt += 1) {
      expect((await LoginGuard.recordFailure(user._id.toString(), { ip: "203.0.113.7", now })).locked).toBe(false);
    }
    expect((await LoginGuard.recordFailure(user._id.toString(), { ip: "203.0.113.7", now })).locked).toBe(true);

    const locked = await UserModel.findById(user._id).lean();
    expect(LoginGuard.isLocked(locked!, now)).toBe(true);
    expect(LoginGuard.isLocked(locked!, new Date(now.getTime() + LOCK_MINUTES * 60_000 + 1000))).toBe(false);
    expect(await AuditLogModel.exists({ organizationId, action: "auth.account-locked", resourceId: user._id })).toBeTruthy();
  });

  it("a successful sign-in clears the failure count and records the sign-in", async () => {
    const { user, organizationId } = await makeUser();
    const now = new Date("2026-09-28T09:00:00.000Z");
    await LoginGuard.recordFailure(user._id.toString(), { ip: "203.0.113.7", now });
    await LoginGuard.recordFailure(user._id.toString(), { ip: "203.0.113.7", now });

    await LoginGuard.recordSuccess(user._id.toString(), { ip: "203.0.113.7", now });

    const fresh = await UserModel.findById(user._id).lean();
    expect(fresh!.failedSignInCount).toBe(0);
    expect(fresh!.lastSignInAt?.toISOString()).toBe(now.toISOString());
    expect(await AuditLogModel.exists({ organizationId, action: "auth.signed-in", resourceId: user._id })).toBeTruthy();
    expect(await AuditLogModel.exists({ organizationId, action: "auth.sign-in-failed", resourceId: user._id })).toBeTruthy();
  });

  it("an administrator can unlock an account early", async () => {
    const { user } = await makeUser();
    const now = new Date();
    for (let attempt = 0; attempt < MAX_FAILED_SIGN_INS; attempt += 1) await LoginGuard.recordFailure(user._id.toString(), { ip: "203.0.113.7", now });

    await LoginGuard.unlock(user._id.toString(), { userId: undefined });
    const fresh = await UserModel.findById(user._id).lean();
    expect(LoginGuard.isLocked(fresh!, now)).toBe(false);
    expect(fresh!.failedSignInCount).toBe(0);
  });

  it("limits sign-in attempts per network, shared across server instances through the database", async () => {
    const key = `ip:198.51.100.${Math.floor(Math.random() * 250)}-${Date.now()}`;
    const now = new Date("2026-09-28T09:00:00.000Z");
    for (let attempt = 0; attempt < NETWORK_ATTEMPT_LIMIT; attempt += 1) expect(await LoginGuard.allowAttempt(key, now)).toBe(true);
    expect(await LoginGuard.allowAttempt(key, now)).toBe(false);
    // A new window starts fresh.
    expect(await LoginGuard.allowAttempt(key, new Date(now.getTime() + 16 * 60_000))).toBe(true);
  });
});
