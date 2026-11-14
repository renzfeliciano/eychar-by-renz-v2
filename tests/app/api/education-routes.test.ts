import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EducationLevelModel, EducationRecordModel, EmployeeModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";

// /api/employees/[id]/education end to end, with only the session faked.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));
const collection = await import("@/app/api/employees/[id]/education/route");
const member = await import("@/app/api/employees/[id]/education/[recordId]/route");

const unique = () => `${Date.now()}.${Math.random()}`;
const url = (path: string) => new URL(path, "http://localhost:4100");
const json = { "Content-Type": "application/json" };
const collectionContext = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const memberContext = (id: string, recordId: string) => ({ params: Promise.resolve({ id, recordId }) }) as never;
const post = (employeeId: string, body: unknown) =>
  collection.POST(new NextRequest(url(`/api/employees/${employeeId}/education`), { method: "POST", body: JSON.stringify(body), headers: json }), collectionContext(employeeId));
const patch = (employeeId: string, recordId: string, body: unknown) =>
  member.PATCH(new NextRequest(url(`/api/employees/${employeeId}/education/${recordId}`), { method: "PATCH", body: JSON.stringify(body), headers: json }), memberContext(employeeId, recordId));
const remove = (employeeId: string, recordId: string, body: unknown) =>
  member.DELETE(new NextRequest(url(`/api/employees/${employeeId}/education/${recordId}`), { method: "DELETE", body: JSON.stringify(body), headers: json }), memberContext(employeeId, recordId));

async function signInWith(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `edu.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  session.mockResolvedValue({ user: { id: user._id.toString() } });
}

async function seedEmployee(organizationId: Types.ObjectId) {
  const person = await PersonModel.create({ organizationId, firstName: "Debbie", lastName: "Abellara" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `T-${unique()}` });
  return employee._id.toString();
}

describe("/api/employees/[id]/education", () => {
  let organizationId: Types.ObjectId;
  let orgId: string;
  let employeeId: string;

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Edu Co", slug: `edu-${unique()}` }))._id;
    orgId = organizationId.toString();
    await EducationLevelModel.create({ organizationId, code: "bachelors_degree", name: "Bachelor’s Degree", sortOrder: 6 });
    employeeId = await seedEmployee(organizationId);
  });

  const body = (extra: Record<string, unknown> = {}) => ({ organizationId: orgId, levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: 2014, ...extra });

  it("adds, edits and removes an entry for a user who may update employees", async () => {
    await signInWith(organizationId, ["employees.update"]);

    const created = await post(employeeId, body());
    expect(created.status).toBe(201);
    const { record } = await created.json();
    expect(record).toEqual({ id: expect.any(String), levelCode: "bachelors_degree", school: "PUP", course: "BS Accountancy", yearGraduated: 2014 });

    const edited = await patch(employeeId, record.id, { organizationId: orgId, school: "PUP Sta. Mesa", yearGraduated: null });
    expect(edited.status).toBe(200);
    expect((await edited.json()).record).toEqual({ id: record.id, levelCode: "bachelors_degree", school: "PUP Sta. Mesa", course: "BS Accountancy", yearGraduated: null });

    const removed = await remove(employeeId, record.id, { organizationId: orgId });
    expect(removed.status).toBe(200);
    expect(await EducationRecordModel.findById(record.id)).toBeNull();
  });

  it("refuses a user who can only read employees, and changes nothing", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const { record } = await (await post(employeeId, body())).json();
    await signInWith(organizationId, ["employees.read"]);

    expect((await post(employeeId, body({ school: "Second" }))).status).toBe(403);
    expect((await patch(employeeId, record.id, { organizationId: orgId, school: "Changed" })).status).toBe(403);
    expect((await remove(employeeId, record.id, { organizationId: orgId })).status).toBe(403);
    expect(await EducationRecordModel.countDocuments({ organizationId })).toBe(1);
    expect((await EducationRecordModel.findById(record.id).lean())?.school).toBe("PUP");
  });

  it("answers 401 with no session", async () => {
    session.mockResolvedValue(null);
    expect((await post(employeeId, body())).status).toBe(401);
  });

  it("answers 400 for a malformed id, a missing school or a bad year, not 500", async () => {
    await signInWith(organizationId, ["employees.update"]);
    expect((await post("not-an-id", body())).status).toBe(400);
    expect((await post(employeeId, body({ school: "" }))).status).toBe(400);
    expect((await post(employeeId, body({ yearGraduated: "abc" }))).status).toBe(400);
    expect((await post(employeeId, body({ yearGraduated: 1850 }))).status).toBe(400);
    expect((await patch(employeeId, "not-an-id", { organizationId: orgId, school: "X" })).status).toBe(400);
  });

  it("answers 404 for an employee of another organization, and for an entry reached through the wrong employee", async () => {
    await signInWith(organizationId, ["employees.update"]);
    const otherOrg = (await OrganizationModel.create({ name: "Other Co", slug: `other-${unique()}` }))._id;
    const foreignEmployee = await seedEmployee(otherOrg);
    expect((await post(foreignEmployee, body())).status).toBe(404);

    const { record } = await (await post(employeeId, body())).json();
    const colleague = await seedEmployee(organizationId);
    expect((await patch(colleague, record.id, { organizationId: orgId, school: "X" })).status).toBe(404);
    expect((await remove(colleague, record.id, { organizationId: orgId })).status).toBe(404);
  });
});
