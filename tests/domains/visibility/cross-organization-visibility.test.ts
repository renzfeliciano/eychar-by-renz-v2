import { describe, it, expect, beforeEach, vi } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { VisibilityService } from "@/domains/visibility/visibility-service";
import { NotFoundError, ValidationError } from "@/shared/errors";

vi.mock("@/server/db/visibility-context", () => ({ viewerSeesHidden: async () => false }));

const unique = () => `${Date.now()}.${Math.random()}`;

async function seedOrganization(label: string) {
  const organization = await OrganizationModel.create({ name: label, slug: `acme-visx-${label}-${unique()}` });
  const organizationId = organization._id.toString();
  const owner = await UserModel.create({ username: `owner.${label}.${unique()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const role = await RoleModel.create({ organizationId, name: `Clerk ${unique()}` });
  return { organizationId, owner: owner._id.toString(), roleId: role._id };
}

async function seedStaff(organization: { organizationId: string; roleId: unknown }, effectiveTo?: Date) {
  const user = await UserModel.create({ username: `clerk.${unique()}`, passwordHash: "x" });
  await RoleAssignmentModel.create({ organizationId: organization.organizationId, roleId: organization.roleId, userId: user._id, effectiveFrom: new Date("2026-01-01"), effectiveTo });
  return user._id.toString();
}

const hiddenFlag = async (id: string) => (await UserModel.collection.findOne({ _id: new (await import("mongoose")).Types.ObjectId(id) }))?.hiddenFromOthers;

describe("hiding staff accounts stays inside the organization", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("hides and unhides an account that holds a role here", async () => {
    const a = await seedOrganization("A");
    const staff = await seedStaff(a);

    await VisibilityService.setHidden("staff-account", staff, a.organizationId, true, { userId: a.owner });
    expect(await hiddenFlag(staff)).toBe(true);
    await VisibilityService.setHidden("staff-account", staff, a.organizationId, false, { userId: a.owner });
    expect(await hiddenFlag(staff)).toBe(false);
  });

  it("refuses to hide or unhide another organization's account, including its Super Administrator", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    const outsider = await seedStaff(b);

    await expect(VisibilityService.setHidden("staff-account", outsider, a.organizationId, true, { userId: a.owner })).rejects.toThrow(NotFoundError);
    await expect(VisibilityService.setHidden("staff-account", b.owner, a.organizationId, true, { userId: a.owner })).rejects.toThrow(NotFoundError);
    await expect(VisibilityService.setHidden("staff-account", outsider, a.organizationId, false, { userId: a.owner })).rejects.toThrow(NotFoundError);
    expect(await hiddenFlag(outsider)).toBeFalsy();
    expect(await hiddenFlag(b.owner)).toBeFalsy();
  });

  it("refuses an account whose only role here has ended", async () => {
    const a = await seedOrganization("A");
    const former = await seedStaff(a, new Date("2026-06-30"));
    await expect(VisibilityService.setHidden("staff-account", former, a.organizationId, true, { userId: a.owner })).rejects.toThrow(NotFoundError);
  });

  it("rejects inherited object keys as a record type", async () => {
    const a = await seedOrganization("A");
    expect(VisibilityService.isHideable("constructor")).toBe(false);
    expect(VisibilityService.isHideable("toString")).toBe(false);
    await expect(VisibilityService.setHidden("constructor", a.owner, a.organizationId, true, { userId: a.owner })).rejects.toThrow(ValidationError);
  });
});
