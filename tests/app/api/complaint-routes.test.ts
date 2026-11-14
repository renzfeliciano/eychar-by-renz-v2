import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ComplaintModel, EmployeeModel, OrganizationModel, PersonModel, ProjectModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { ComplaintStageService } from "@/domains/catalog/complaint-stage-service";
import { DEFAULT_COMPLAINT_STAGES } from "@/domains/complaints/default-stages";

// /api/complaints end to end, with only the session faked: real permission checks, real database.
const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));
const collection = await import("@/app/api/complaints/route");
const item = await import("@/app/api/complaints/[id]/route");
const stage = await import("@/app/api/complaints/[id]/stage/route");
const details = await import("@/app/api/complaints/[id]/details/route");

const unique = () => `${Date.now()}.${Math.random()}`;
const context = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const url = (path: string) => new URL(path, "http://localhost:4100");
const json = (method: string, path: string, body: unknown) => new NextRequest(url(path), { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

async function signInWith(organizationId: Types.ObjectId, permissionKeys: string[]) {
  const user = await UserModel.create({ username: `complaints.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `Role ${unique()}`, permissionKeys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id, effectiveFrom: new Date("2026-01-01") });
  session.mockResolvedValue({ user: { id: user._id.toString() } });
}

async function seedEmployee(organizationId: Types.ObjectId) {
  const person = await PersonModel.create({ organizationId, firstName: "Juan", lastName: "Dela Cruz" });
  return (await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `CR-${unique()}` }))._id.toString();
}

describe("/api/complaints", () => {
  let organizationId: Types.ObjectId;
  let orgId: string;
  let employeeId: string;

  const post = (body: unknown) => collection.POST(json("POST", "/api/complaints", body));
  const list = (query = "") => collection.GET(new NextRequest(url(`/api/complaints?organizationId=${orgId}${query}`)));
  const patch = (id: string, body: unknown) => item.PATCH(json("PATCH", `/api/complaints/${id}`, body), context(id));
  const move = (id: string, body: unknown) => stage.PATCH(json("PATCH", `/api/complaints/${id}/stage`, body), context(id));
  const saveDetails = (id: string, body: unknown) => details.PATCH(json("PATCH", `/api/complaints/${id}/details`, body), context(id));
  const body = () => ({ organizationId: orgId, employeeId, receivedDate: "2026-11-10", remarks: "Reported by the shift lead" });

  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
    organizationId = (await OrganizationModel.create({ name: "Complaint Routes", slug: `complaint-routes-${unique()}` }))._id;
    orgId = organizationId.toString();
    for (const defaults of DEFAULT_COMPLAINT_STAGES) await ComplaintStageService.create({ organizationId: orgId, ...defaults }, {});
    employeeId = await seedEmployee(organizationId);
  });

  async function createOne() {
    await signInWith(organizationId, ["complaints.create"]);
    const response = await post(body());
    return (await response.json()).complaint as { _id: string; irNumber: string; stage: string };
  }

  it("creates a complaint for a user who may create them", async () => {
    await signInWith(organizationId, ["complaints.create"]);
    const response = await post(body());
    expect(response.status).toBe(201);
    const { complaint } = await response.json();
    expect(complaint).toMatchObject({ irNumber: "IR-0001", stage: "received", employeeId });
  });

  it("refuses to create for a user who can only read, and writes nothing", async () => {
    await signInWith(organizationId, ["complaints.read"]);
    expect((await post(body())).status).toBe(403);
    expect(await ComplaintModel.countDocuments({ organizationId })).toBe(0);
  });

  it("answers 400 for a malformed respondent id or a missing date, not 500", async () => {
    await signInWith(organizationId, ["complaints.create"]);
    expect((await post({ ...body(), employeeId: "not-an-id" })).status).toBe(400);
    expect((await post({ ...body(), receivedDate: undefined })).status).toBe(400);
  });

  it("refuses a respondent from another organization", async () => {
    const other = (await OrganizationModel.create({ name: "Other", slug: `other-complaint-${unique()}` }))._id;
    const foreign = await seedEmployee(other);
    await signInWith(organizationId, ["complaints.create"]);
    expect((await post({ ...body(), employeeId: foreign })).status).toBe(404);
  });

  it("lists complaints for a reader, filters by stage, and refuses someone without complaints.read", async () => {
    await createOne();
    await signInWith(organizationId, ["complaints.read"]);
    const all = await (await list()).json();
    expect(all.complaints.map((complaint: { irNumber: string }) => complaint.irNumber)).toEqual(["IR-0001"]);
    expect((await (await list("&stage=sanction")).json()).complaints).toEqual([]);

    await signInWith(organizationId, ["employees.read"]);
    expect((await list()).status).toBe(403);
  });

  it("edits a complaint for a user who may update, and refuses a reader", async () => {
    const created = await createOne();
    await signInWith(organizationId, ["complaints.update"]);
    const edited = await patch(created._id, { ...body(), remarks: "Updated remarks" });
    expect(edited.status).toBe(200);
    expect((await edited.json()).complaint.remarks).toBe("Updated remarks");

    await signInWith(organizationId, ["complaints.read"]);
    expect((await patch(created._id, { ...body(), remarks: "Nope" })).status).toBe(403);
    expect((await ComplaintModel.findById(created._id).lean())?.remarks).toBe("Updated remarks");
  });

  it("moves a complaint between stages, refuses a reader, and rejects an unknown stage", async () => {
    const created = await createOne();
    await signInWith(organizationId, ["complaints.update"]);
    const moved = await move(created._id, { organizationId: orgId, stage: "administrative_hearing" });
    expect(moved.status).toBe(200);
    expect((await moved.json()).complaint.stage).toBe("administrative_hearing");

    const unknown = await move(created._id, { organizationId: orgId, stage: "not-a-stage" });
    expect(unknown.status).toBeGreaterThanOrEqual(400);
    expect(unknown.status).toBeLessThan(500);

    await signInWith(organizationId, ["complaints.read"]);
    expect((await move(created._id, { organizationId: orgId, stage: "sanction" })).status).toBe(403);
    expect((await ComplaintModel.findById(created._id).lean())?.stage).toBe("administrative_hearing");
  });

  it("answers 400 for a malformed complaint id on edit and move, not 500", async () => {
    await signInWith(organizationId, ["complaints.update"]);
    expect((await patch("not-an-id", body())).status).toBe(400);
    expect((await move("not-an-id", { organizationId: orgId, stage: "sanction" })).status).toBe(400);
  });

  it("does not touch a complaint that belongs to another organization", async () => {
    const created = await createOne();
    const other = (await OrganizationModel.create({ name: "Other 2", slug: `other2-complaint-${unique()}` }))._id;
    const otherEmployee = await seedEmployee(other);
    await signInWith(other, ["complaints.update"]);
    const response = await patch(created._id, { organizationId: other.toString(), employeeId: otherEmployee, receivedDate: "2026-11-10" });
    expect(response.status).toBe(404);
    expect((await move(created._id, { organizationId: other.toString(), stage: "sanction" })).status).toBe(404);
  });

  it("stores the incident details sent when a complaint is added", async () => {
    await signInWith(organizationId, ["complaints.create"]);
    const project = await ProjectModel.create({ organizationId, name: "Tower A", code: `P-${unique()}` });
    const response = await post({ ...body(), projectId: project._id.toString(), complainantName: "Unit owner", where: "Gate 2", incidentDate: "2026-11-08" });
    expect(response.status).toBe(201);
    const stored = await ComplaintModel.findById((await response.json()).complaint._id).lean();
    expect(stored).toMatchObject({ complainantName: "Unit owner", where: "Gate 2" });
    expect(stored?.projectId?.toString()).toBe(project._id.toString());
  });

  it("saves a stage section for a user who may update, refuses a reader, and rejects bad values with 400", async () => {
    const created = await createOne();
    await signInWith(organizationId, ["complaints.update"]);
    const saved = await saveDetails(created._id, { organizationId: orgId, stage: "administrative_hearing", details: { hearingDate: "2026-12-03", mode: "virtual" } });
    expect(saved.status).toBe(200);
    expect((await ComplaintModel.findById(created._id).lean())?.stageDetails.administrative_hearing.mode).toBe("virtual");

    expect((await saveDetails(created._id, { organizationId: orgId, stage: "administrative_hearing", details: { mode: "phone" } })).status).toBe(400);
    expect((await saveDetails(created._id, { organizationId: orgId, details: {} })).status).toBe(400);
    expect((await saveDetails(created._id, { organizationId: orgId, stage: "not-a-stage", details: { remarks: "x" } })).status).toBeLessThan(500);
    expect((await saveDetails("not-an-id", { organizationId: orgId, stage: "sanction", details: {} })).status).toBe(400);

    await signInWith(organizationId, ["complaints.read"]);
    expect((await saveDetails(created._id, { organizationId: orgId, stage: "sanction", details: { sanction: "Warning" } })).status).toBe(403);
    expect((await ComplaintModel.findById(created._id).lean())?.stageDetails.sanction).toBeUndefined();
  });

  it("saves the target stage's section together with a move", async () => {
    const created = await createOne();
    await signInWith(organizationId, ["complaints.update"]);
    const moved = await move(created._id, { organizationId: orgId, stage: "nte_scheduled", details: { date: "2026-11-20", violations: "Tardiness" } });
    expect(moved.status).toBe(200);
    const stored = await ComplaintModel.findById(created._id).lean();
    expect(stored?.stage).toBe("nte_scheduled");
    expect(stored?.stageDetails.nte_scheduled.violations).toBe("Tardiness");

    const bad = await move(created._id, { organizationId: orgId, stage: "administrative_hearing", details: { mode: "phone" } });
    expect(bad.status).toBe(400);
    expect((await ComplaintModel.findById(created._id).lean())?.stage).toBe("nte_scheduled");
  });

  it("does not let another organization save details on this complaint", async () => {
    const created = await createOne();
    const other = (await OrganizationModel.create({ name: "Other 3", slug: `other3-complaint-${unique()}` }))._id;
    await signInWith(other, ["complaints.update"]);
    expect((await saveDetails(created._id, { organizationId: other.toString(), stage: "sanction", details: {} })).status).toBe(404);
  });

  it("refuses a project from another organization and a malformed project id, and treats a blank project as none", async () => {
    await signInWith(organizationId, ["complaints.create"]);
    const other = (await OrganizationModel.create({ name: "Other 4", slug: `other4-complaint-${unique()}` }))._id;
    const foreign = await ProjectModel.create({ organizationId: other, name: "Elsewhere", code: `P-${unique()}` });

    expect((await post({ ...body(), projectId: foreign._id.toString() })).status).toBe(404);
    expect((await post({ ...body(), projectId: "not-an-id" })).status).toBe(400);
    const blank = await post({ ...body(), projectId: "" });
    expect(blank.status).toBe(201);
    expect(await ComplaintModel.findById((await blank.json()).complaint._id).lean()).not.toHaveProperty("projectId");
  });
});
