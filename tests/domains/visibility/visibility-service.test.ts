import { describe, it, expect, beforeEach, vi } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, LocationModel, OrganizationModel, ProjectModel, UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { VisibilityService } from "@/domains/visibility/visibility-service";
import { AuthorizationError } from "@/shared/errors";

// Who is looking: the Super Administrator (and a self-service user, for their own data) sees hidden records; everyone else doesn't.
const viewer = { seesHidden: false };
vi.mock("@/server/db/visibility-context", () => ({ viewerSeesHidden: async () => viewer.seesHidden }));

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-vis-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  const hr = await UserModel.create({ username: `hr.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const real = await LocationModel.create({ organizationId, name: "Head Office", code: `HO-${Math.random()}` });
  const test = await LocationModel.create({ organizationId, name: "Test Location", code: `TEST-${Math.random()}` });
  return { organizationId, owner: owner._id.toString(), hr: hr._id.toString(), realId: real._id.toString(), testId: test._id.toString() };
}

describe("hidden test data", () => {
  beforeEach(async () => {
    await connectMongoDB();
    viewer.seesHidden = false;
  });

  it("hides a record from everyone else, everywhere it's queried, but not from the Super Administrator", async () => {
    const s = await seed();

    await VisibilityService.setHidden("location", s.testId, s.organizationId, true, { userId: s.owner });

    viewer.seesHidden = false;
    expect((await LocationModel.find({ organizationId: s.organizationId }).lean()).map((location) => location.name)).toEqual(["Head Office"]);
    expect(await LocationModel.countDocuments({ organizationId: s.organizationId })).toBe(1);
    expect(await LocationModel.findById(s.testId).lean()).toBeNull();
    expect(await LocationModel.aggregate([{ $match: { organizationId: new (await import("mongoose")).Types.ObjectId(s.organizationId) } }])).toHaveLength(1);

    viewer.seesHidden = true;
    expect(await LocationModel.countDocuments({ organizationId: s.organizationId })).toBe(2);
    expect((await LocationModel.findById(s.testId).lean())?.hiddenFromOthers).toBe(true);
  });

  it("unhides it again, and audits both changes", async () => {
    const s = await seed();
    await VisibilityService.setHidden("location", s.testId, s.organizationId, true, { userId: s.owner });
    await VisibilityService.setHidden("location", s.testId, s.organizationId, false, { userId: s.owner });

    expect(await LocationModel.countDocuments({ organizationId: s.organizationId })).toBe(2);
    expect(await AuditLogModel.countDocuments({ resourceId: s.testId, action: { $in: ["record.hidden", "record.unhidden"] } })).toBe(2);
  });

  it("is the Super Administrator's alone", async () => {
    const s = await seed();
    await expect(VisibilityService.setHidden("location", s.testId, s.organizationId, true, { userId: s.hr })).rejects.toThrow(AuthorizationError);
  });

  it("covers projects (and the other record types) too", async () => {
    const s = await seed();
    const project = await ProjectModel.create({ organizationId: s.organizationId, name: "Test Project", code: `TP-${Math.random()}` });
    await VisibilityService.setHidden("project", project._id.toString(), s.organizationId, true, { userId: s.owner });

    expect(await ProjectModel.countDocuments({ organizationId: s.organizationId })).toBe(0);
    expect(VisibilityService.hideableTypes()).toEqual(expect.arrayContaining(["employee", "project", "location", "position", "staff-account", "leave-type", "shift-template"]));
  });
});
