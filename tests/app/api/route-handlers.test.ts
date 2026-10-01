import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";

// Route handlers end to end (validation → permission → service → response),
// with only the session faked.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const roleAssignments = await import("@/app/api/role-assignments/route");
const catalogs = await import("@/app/api/catalogs/[type]/route");
const employeeExport = await import("@/app/api/employees/export/route");

const unique = () => `${Date.now()}.${Math.random()}`;

async function seedUser(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `route.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  return { userId: user._id.toString(), roleId: role._id.toString() };
}

function request(url: string, init?: { method: string; body: unknown }) {
  return new NextRequest(new URL(url, "http://localhost:4100"), init ? { method: init.method, body: JSON.stringify(init.body), headers: { "Content-Type": "application/json" } } : undefined);
}

const typeContext = (type: string) => ({ params: Promise.resolve({ type }) }) as never;

describe("API route handlers", () => {
  let organizationId: Types.ObjectId;

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Routes Co", slug: `routes-${unique()}` }))._id;
  });

  it("refuses a signed-out caller with 401", async () => {
    session.mockResolvedValue(null);
    const response = await roleAssignments.GET(request(`/api/role-assignments?organizationId=${organizationId}`));
    expect(response.status).toBe(401);
  });

  it("rejects a malformed organization id with 400, before any permission check", async () => {
    const { userId } = await seedUser(organizationId, ["roles.read"]);
    session.mockResolvedValue({ user: { id: userId } });
    const response = await roleAssignments.GET(request("/api/role-assignments?organizationId=not-an-id"));
    expect(response.status).toBe(400);
  });

  it("lets a role reader list assignments but not hand out roles", async () => {
    const { userId, roleId } = await seedUser(organizationId, ["roles.read"]);
    session.mockResolvedValue({ user: { id: userId } });

    const list = await roleAssignments.GET(request(`/api/role-assignments?organizationId=${organizationId}`));
    expect(list.status).toBe(200);

    const assign = await roleAssignments.POST(request("/api/role-assignments", { method: "POST", body: { organizationId: organizationId.toString(), roleId, userId } }));
    expect(assign.status).toBe(403);
  });

  it("refuses another organization's data even with the permission here", async () => {
    const { userId } = await seedUser(organizationId, ["roles.read"]);
    const other = await OrganizationModel.create({ name: "Other", slug: `routes-other-${unique()}` });
    session.mockResolvedValue({ user: { id: userId } });
    const response = await roleAssignments.GET(request(`/api/role-assignments?organizationId=${other._id}`));
    expect(response.status).toBe(403);
  });

  it("checks the catalog's own permission, and 404s an unknown catalog type", async () => {
    const { userId } = await seedUser(organizationId, ["case-statuses.read"]);
    session.mockResolvedValue({ user: { id: userId } });

    const read = await catalogs.GET(request(`/api/catalogs/case-statuses?organizationId=${organizationId}`), typeContext("case-statuses"));
    expect(read.status).toBe(200);

    const otherCatalog = await catalogs.GET(request(`/api/catalogs/event-categories?organizationId=${organizationId}`), typeContext("event-categories"));
    expect(otherCatalog.status).toBe(403);

    const create = await catalogs.POST(request("/api/catalogs/case-statuses", { method: "POST", body: { organizationId: organizationId.toString(), name: "Escalated" } }), typeContext("case-statuses"));
    expect(create.status).toBe(403);

    const unknown = await catalogs.GET(request(`/api/catalogs/nope?organizationId=${organizationId}`), typeContext("nope"));
    expect(unknown.status).toBe(404);
  });

  it("serves the roster export only with employees.read, and audits it", async () => {
    const reader = await seedUser(organizationId, ["employees.read"]);
    const outsider = await seedUser(organizationId, ["leave.read"]);

    session.mockResolvedValue({ user: { id: outsider.userId } });
    const refused = await employeeExport.GET(request(`/api/employees/export?organizationId=${organizationId}`));
    expect(refused.status).toBe(403);

    session.mockResolvedValue({ user: { id: reader.userId } });
    const allowed = await employeeExport.GET(request(`/api/employees/export?organizationId=${organizationId}`));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ rows: [] });
    expect(await AuditLogModel.exists({ organizationId, action: "employees.exported" })).toBeTruthy();
  });
});
