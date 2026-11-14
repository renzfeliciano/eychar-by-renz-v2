import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, EmploymentModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";

// PATCH /api/employees/[id]/employment/ending and POST .../reinstate end to end, with only the session faked.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));
const ending = await import("@/app/api/employees/[id]/employment/ending/route");
const reinstateRoute = await import("@/app/api/employees/[id]/employment/reinstate/route");

const unique = () => `${Date.now()}.${Math.random()}`;
const url = (path: string) => new URL(path, "http://localhost:4100");
const json = { "Content-Type": "application/json" };
const context = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const correct = (employeeId: string, body: unknown) =>
  ending.PATCH(new NextRequest(url(`/api/employees/${employeeId}/employment/ending`), { method: "PATCH", body: JSON.stringify(body), headers: json }), context(employeeId));
const reinstate = (employeeId: string, body: unknown) =>
  reinstateRoute.POST(new NextRequest(url(`/api/employees/${employeeId}/employment/reinstate`), { method: "POST", body: JSON.stringify(body), headers: json }), context(employeeId));

async function signInWith(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `ending.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  session.mockResolvedValue({ user: { id: user._id.toString() } });
}

async function endedEmployee(organizationId: Types.ObjectId, ended = true) {
  const person = await PersonModel.create({ organizationId, firstName: "Florence", lastName: "San Diego" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `T-${unique()}` });
  await EmploymentModel.create({
    organizationId,
    employeeId: employee._id,
    employmentType: "regular",
    status: ended ? "terminated" : "active",
    effectiveFrom: new Date("2025-03-03"),
    ...(ended ? { effectiveTo: new Date("2026-10-30"), terminationReason: "Recorded as terminated" } : {}),
  });
  return employee._id.toString();
}

describe("employment ending routes", () => {
  let organizationId: Types.ObjectId;
  let orgId: string;
  let employeeId: string;

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Ending Co", slug: `ending-${unique()}` }))._id;
    orgId = organizationId.toString();
    for (const [code, name, active] of [["active", "Active", true], ["terminated", "Terminated", false], ["resigned", "Resigned", false]] as const) {
      await EmploymentStatusService.create({ organizationId: orgId, code, name, metadata: { isActiveHeadcount: active } }, {});
    }
    employeeId = await endedEmployee(organizationId);
  });

  it("corrects Terminated to Resigned for a user who may update employees", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const response = await correct(employeeId, { organizationId: orgId, status: "resigned", terminationReason: "Resignation letter 3 Nov" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.employment.status).toBe("resigned");
    expect((await EmploymentModel.findOne({ employeeId }).lean())?.status).toBe("resigned");
  });

  it("reinstates for a user who may update employees", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const response = await reinstate(employeeId, { organizationId: orgId, reason: "Recorded in error" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ employment: { status: "active" } });
    expect((await EmploymentModel.findOne({ employeeId }).lean())?.effectiveTo).toBeUndefined();
  });

  it("refuses a user who can only read employees, and changes nothing", async () => {
    await signInWith(organizationId, ["employees.read"]);
    expect((await correct(employeeId, { organizationId: orgId, status: "resigned" })).status).toBe(403);
    expect((await reinstate(employeeId, { organizationId: orgId, reason: "Because" })).status).toBe(403);
    const stored = await EmploymentModel.findOne({ employeeId }).lean();
    expect(stored?.status).toBe("terminated");
    expect(stored?.effectiveTo).toBeDefined();
  });

  it("answers 401 with no session", async () => {
    session.mockResolvedValue(null);
    expect((await correct(employeeId, { organizationId: orgId, status: "resigned" })).status).toBe(401);
    expect((await reinstate(employeeId, { organizationId: orgId, reason: "Because" })).status).toBe(401);
  });

  it("answers 400 for a malformed id, a bad date or a blank reason, not 500", async () => {
    await signInWith(organizationId, ["employees.update"]);
    expect((await correct("not-an-id", { organizationId: orgId, status: "resigned" })).status).toBe(400);
    expect((await correct(employeeId, { organizationId: orgId, effectiveTo: "not-a-date" })).status).toBe(400);
    expect((await reinstate("not-an-id", { organizationId: orgId, reason: "Because" })).status).toBe(400);
    expect((await reinstate(employeeId, { organizationId: orgId, reason: "" })).status).toBe(400);
    expect((await reinstate(employeeId, { organizationId: orgId })).status).toBe(400);
  });

  it("answers 404 for an employee of another organization", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const otherOrg = (await OrganizationModel.create({ name: "Other Co", slug: `other-${unique()}` }))._id;
    const foreign = await endedEmployee(otherOrg);
    expect((await correct(foreign, { organizationId: orgId, status: "resigned" })).status).toBe(404);
    expect((await reinstate(foreign, { organizationId: orgId, reason: "Because" })).status).toBe(404);
  });

  it("answers 422 with the reason when the rules refuse, passing the message through", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const open = await endedEmployee(organizationId, false);
    const refused = await reinstate(open, { organizationId: orgId, reason: "Because" });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error).toMatch(/hasn.t ended/);

    const nothing = await correct(employeeId, { organizationId: orgId, status: "terminated" });
    expect(nothing.status).toBe(422);
    expect((await nothing.json()).error).toMatch(/Nothing changed/);
  });
});
