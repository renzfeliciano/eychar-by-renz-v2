import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { DeletionService } from "@/domains/deletion/deletion-service";
import { DELETABLE_TYPES, isDeletableType } from "@/domains/deletion/deletion-registry";
import { BusinessRuleError } from "@/shared/errors";

const unique = () => `${Date.now()}.${Math.random()}`;

async function seedOrganization(label: string) {
  const organization = await OrganizationModel.create({ name: label, slug: `acme-del-${label}-${unique()}` });
  const organizationId = organization._id.toString();
  const owner = await UserModel.create({ username: `owner.${label}.${unique()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const role = await RoleModel.create({ organizationId, name: `Clerk ${unique()}`, permissionKeys: ["employees.read"] });
  return { organizationId, owner: owner._id.toString(), roleId: role._id };
}

async function seedStaff(...memberships: { organizationId: string; roleId: unknown; endedAt?: Date }[]) {
  const user = await UserModel.create({ username: `clerk.${unique()}`, passwordHash: "x" });
  for (const membership of memberships) {
    await RoleAssignmentModel.create({ organizationId: membership.organizationId, roleId: membership.roleId, userId: user._id, effectiveFrom: new Date("2026-01-01"), effectiveTo: membership.endedAt });
  }
  return { id: user._id.toString(), username: user.username as string };
}

describe("deleting a staff account stays inside the organization", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("is blocked while the account still has active roles in another organization, which stay intact", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    const staff = await seedStaff(a, b);

    const preview = await DeletionService.preview("staff-account", staff.id, a.organizationId);
    expect(preview.blockers).toContain("This login account also has roles in another organization; it can only be deleted once it has none there");
    await expect(DeletionService.remove("staff-account", staff.id, a.organizationId, { confirm: staff.username }, { userId: a.owner })).rejects.toThrow(BusinessRuleError);

    expect(await UserModel.exists({ _id: staff.id })).toBeTruthy();
    expect(await RoleAssignmentModel.countDocuments({ userId: staff.id, organizationId: b.organizationId })).toBe(1);
    expect(await RoleAssignmentModel.countDocuments({ userId: staff.id, organizationId: a.organizationId })).toBe(1);
  });

  it("is blocked when the account is the Super Administrator of another organization", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    await RoleAssignmentModel.create({ organizationId: a.organizationId, roleId: a.roleId, userId: b.owner, effectiveFrom: new Date("2026-01-01") });

    const preview = await DeletionService.preview("staff-account", b.owner, a.organizationId);

    expect(preview.blockers).toContain("This account is a Super Administrator in another organization and can't be deleted");
    expect(await SuperAdminService.isSuperAdmin(b.owner, b.organizationId)).toBe(true);
  });

  it("removes only this organization's role assignments, leaving another organization's history untouched", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    const staff = await seedStaff(a, { ...b, endedAt: new Date("2026-06-30") });

    await DeletionService.remove("staff-account", staff.id, a.organizationId, { confirm: staff.username }, { userId: a.owner });

    expect(await UserModel.exists({ _id: staff.id })).toBeNull();
    expect(await RoleAssignmentModel.countDocuments({ userId: staff.id, organizationId: a.organizationId })).toBe(0);
    expect(await RoleAssignmentModel.countDocuments({ userId: staff.id, organizationId: b.organizationId })).toBe(1);
  });

  it("can't reach an account that isn't in this organization at all", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    const outsider = await seedStaff(b);

    await expect(DeletionService.preview("staff-account", outsider.id, a.organizationId)).rejects.toThrow(/not found/);
  });
});

describe("isDeletableType", () => {
  it("accepts registered types and rejects inherited object keys", () => {
    expect(isDeletableType("employee")).toBe(true);
    expect(isDeletableType("staff-account")).toBe(true);
    for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) expect(isDeletableType(key)).toBe(false);
    expect(Object.keys(DELETABLE_TYPES)).not.toContain("constructor");
  });
});
