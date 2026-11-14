import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";

// Server-side authorization for the HR "recalculate" action (plan Phase 3,
// owner decision 11): its own permission, never attendance.update.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const recalculate = await import("@/app/api/attendance/recalculate/route");

const unique = () => `${Date.now()}.${Math.random()}`;

async function seedUser(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `recalc.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  return user._id.toString();
}

function post(body: unknown) {
  return new NextRequest(new URL("/api/attendance/recalculate", "http://localhost:4100"), { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/attendance/recalculate", () => {
  let organizationId: Types.ObjectId;

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Recalc Co", slug: `recalc-${unique()}` }))._id;
  });

  it("refuses a caller who can adjust attendance but lacks attendance.recalculate", async () => {
    session.mockResolvedValue({ user: { id: await seedUser(organizationId, ["attendance.read", "attendance.update"]) } });
    const response = await recalculate.POST(post({ organizationId: organizationId.toString(), from: "2026-10-01", to: "2026-10-15" }));
    expect(response.status).toBe(403);
  });

  it("runs for a holder of attendance.recalculate and reports what changed", async () => {
    session.mockResolvedValue({ user: { id: await seedUser(organizationId, ["attendance.recalculate"]) } });
    const response = await recalculate.POST(post({ organizationId: organizationId.toString(), from: "2026-10-01", to: "2026-10-15" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ scanned: 0, changed: 0 });
  });

  it("validates the range", async () => {
    session.mockResolvedValue({ user: { id: await seedUser(organizationId, ["attendance.recalculate"]) } });
    const response = await recalculate.POST(post({ organizationId: organizationId.toString(), from: "2026-10-15", to: "2026-10-01" }));
    expect(response.status).toBe(400);
  });

  it("refuses a signed-out caller", async () => {
    session.mockResolvedValue(null);
    const response = await recalculate.POST(post({ organizationId: organizationId.toString(), from: "2026-10-01", to: "2026-10-15" }));
    expect(response.status).toBe(401);
  });
});
