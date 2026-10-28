import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, EmploymentModel, EmploymentTypeModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";

// PATCH /api/employees/[id]/employment/terms and /api/evaluation-follow-ups end to end, with only the session faked.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));
const terms = await import("@/app/api/employees/[id]/employment/terms/route");
const followUps = await import("@/app/api/evaluation-follow-ups/route");
const followUp = await import("@/app/api/evaluation-follow-ups/[id]/route");

const unique = () => `${Date.now()}.${Math.random()}`;
const context = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const patch = (id: string, body: unknown) =>
  terms.PATCH(new NextRequest(new URL(`/api/employees/${id}/employment/terms`, "http://localhost:4100"), { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), context(id));

async function signInWith(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `terms.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  session.mockResolvedValue({ user: { id: user._id.toString() } });
}

describe("PATCH /api/employees/[id]/employment/terms", () => {
  let organizationId: Types.ObjectId;
  let employeeId: string;

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Terms Co", slug: `terms-${unique()}` }))._id;
    await EmploymentTypeModel.create({ organizationId, code: "regular", name: "Regular", metadata: {} });
    await EmploymentTypeModel.create({ organizationId, code: "probationary", name: "Probationary", metadata: { requiresEndOfContract: true } });
    const person = await PersonModel.create({ organizationId, firstName: "Debbie", lastName: "Abellara" });
    const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `T-${unique()}` });
    await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "probationary", status: "active", effectiveFrom: new Date("2026-05-01"), endOfContract: new Date("2026-11-01") });
    employeeId = employee._id.toString();
  });

  it("regularizes for a user who may update employees", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const response = await patch(employeeId, { organizationId: organizationId.toString(), employmentType: "regular", effectiveFrom: "2026-10-28" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ employment: { employmentType: "regular", endOfContract: null } });
  });

  it("refuses a user who can only read employees", async () => {
    await signInWith(organizationId, ["employees.read"]);
    const response = await patch(employeeId, { organizationId: organizationId.toString(), employmentType: "regular", effectiveFrom: "2026-10-28" });
    expect(response.status).toBe(403);
    expect((await EmploymentModel.findOne({ employeeId }).lean())?.employmentType).toBe("probationary");
  });

  it("answers 400 for a malformed employee id or a missing date, not 500", async () => {
    await signInWith(organizationId, ["employees.update"]);
    expect((await patch("not-an-id", { organizationId: organizationId.toString(), employmentType: "regular", effectiveFrom: "2026-10-28" })).status).toBe(400);
    expect((await patch(employeeId, { organizationId: organizationId.toString(), employmentType: "regular" })).status).toBe(400);
  });
});

describe("/api/evaluation-follow-ups", () => {
  let organizationId: Types.ObjectId;
  let employeeId: string;
  const post = (body: unknown) => followUps.POST(new NextRequest(new URL("/api/evaluation-follow-ups", "http://localhost:4100"), { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
  const remove = (id: string, body: unknown) =>
    followUp.DELETE(new NextRequest(new URL(`/api/evaluation-follow-ups/${id}`, "http://localhost:4100"), { method: "DELETE", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), context(id));

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Follow-up Routes", slug: `follow-up-routes-${unique()}` }))._id;
    const person = await PersonModel.create({ organizationId, firstName: "John Mark", lastName: "Caido" });
    employeeId = (await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `FR-${unique()}` }))._id.toString();
  });

  const body = () => ({ organizationId: organizationId.toString(), employeeId, dueKey: "2026-11-12", outcome: "sent", actionDate: "2026-10-01", sentTo: "Engr. Santos" });

  it("records and undoes for a user who may update employees", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const created = await post(body());
    expect(created.status).toBe(201);
    const { followUp: saved } = await created.json();
    expect((await remove(saved.id, { organizationId: organizationId.toString() })).status).toBe(200);
  });

  it("refuses a reader, and answers 400 for a bad date or outcome", async () => {
    await signInWith(organizationId, ["employees.read"]);
    expect((await post(body())).status).toBe(403);

    await signInWith(organizationId, ["employees.update"]);
    expect((await post({ ...body(), actionDate: "October 1" })).status).toBe(400);
    expect((await post({ ...body(), outcome: "lost" })).status).toBe(400);
    expect((await remove("nope", { organizationId: organizationId.toString() })).status).toBe(400);
  });
});
