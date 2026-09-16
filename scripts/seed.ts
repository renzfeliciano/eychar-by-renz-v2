import mongoose from "mongoose";
import { config } from "dotenv";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import {
  OrganizationModel,
  PermissionModel,
  RoleModel,
  UserModel,
  PersonModel,
  RoleAssignmentModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";

config({ path: ".env.local", override: true });
config({ path: ".env" });

// Baseline permission catalog. This is seeded *data*, not hardcoded
// authorization logic (AGENTS.md §54) — new permission keys are added here
// as later phases introduce the domains that need them. Granular
// create/read/update per resource (AGENTS.md §20's own example is
// "employees.read"/"employees.create", not one coarse "employees.manage")
// rather than a single "manage" key — no "delete" key exists anywhere yet
// because nothing in this codebase hard-deletes (AGENTS.md §53); removal
// is always a status transition, covered by "update".
const BASELINE_PERMISSIONS = [
  { key: "users.create", description: "Create user accounts", category: "identity" },
  { key: "users.read", description: "View user accounts", category: "identity" },
  { key: "users.update", description: "Update user accounts", category: "identity" },
  { key: "roles.create", description: "Create roles and role assignments", category: "identity" },
  { key: "roles.read", description: "View roles and role assignments", category: "identity" },
  { key: "roles.update", description: "Update roles and role assignments", category: "identity" },

  { key: "organization.create", description: "Create organizations", category: "organization" },
  { key: "organization.read", description: "View organization details", category: "organization" },
  { key: "organization.update", description: "Update organization details", category: "organization" },

  { key: "organization-units.create", description: "Create organization units", category: "organization" },
  { key: "organization-units.read", description: "View organization units", category: "organization" },
  { key: "organization-units.update", description: "Update organization units", category: "organization" },

  { key: "positions.create", description: "Create positions", category: "organization" },
  { key: "positions.read", description: "View positions", category: "organization" },
  { key: "positions.update", description: "Update positions", category: "organization" },

  { key: "locations.create", description: "Create locations", category: "organization" },
  { key: "locations.read", description: "View locations", category: "organization" },
  { key: "locations.update", description: "Update locations", category: "organization" },

  { key: "projects.create", description: "Create projects", category: "organization" },
  { key: "projects.read", description: "View projects", category: "organization" },
  { key: "projects.update", description: "Update projects", category: "organization" },

  { key: "employees.create", description: "Hire employees and record new employment stints", category: "workforce" },
  { key: "employees.read", description: "View employees, employment, and assignment history", category: "workforce" },
  { key: "employees.update", description: "Transfer employees and terminate employment", category: "workforce" },

  { key: "attendance.create", description: "Record employee attendance", category: "attendance" },
  { key: "attendance.read", description: "View attendance records", category: "attendance" },
  { key: "attendance.update", description: "Adjust attendance records", category: "attendance" },
  { key: "attendance-policies.create", description: "Create attendance policies", category: "attendance" },
  { key: "attendance-policies.read", description: "View attendance policies", category: "attendance" },
  { key: "attendance-policies.update", description: "Update attendance policies", category: "attendance" },
] as const;

// Superseded by the granular create/read/update keys above (this seed used
// to grant a single coarse "<resource>.manage" per resource). Explicitly
// retired rather than left as orphaned catalog entries and stale grants on
// already-seeded roles (AGENTS.md §53 — explicit, idempotent cleanup, not
// a silent migration).
const RETIRED_PERMISSION_KEYS = [
  "organization.manage",
  "users.manage",
  "roles.manage",
  "organization-units.manage",
  "positions.manage",
  "locations.manage",
  "projects.manage",
];

async function upsertPermissionCatalog() {
  await Promise.all(
    BASELINE_PERMISSIONS.map((permission) =>
      PermissionModel.findOneAndUpdate(
        { key: permission.key },
        { $setOnInsert: permission },
        { upsert: true },
      ),
    ),
  );
}

async function retireSupersededPermissions() {
  await PermissionModel.deleteMany({ key: { $in: RETIRED_PERMISSION_KEYS } });
  await RoleModel.updateMany(
    { permissionKeys: { $in: RETIRED_PERMISSION_KEYS } },
    { $pull: { permissionKeys: { $in: RETIRED_PERMISSION_KEYS } } },
  );
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") || firstName };
}

async function seed() {
  await connectMongoDB();
  await upsertPermissionCatalog();
  await retireSupersededPermissions();

  const organizationName = process.env.SEED_ORGANIZATION_NAME;
  const organizationSlug = process.env.SEED_ORGANIZATION_SLUG;
  const hrFullName = process.env.SEED_HR_FULL_NAME;
  const hrUsername = process.env.SEED_HR_USERNAME?.trim().toLowerCase();
  const hrPassword = process.env.SEED_HR_PASSWORD;

  if (!organizationName || !organizationSlug || !hrFullName || !hrUsername || !hrPassword) {
    throw new Error(
      "SEED_ORGANIZATION_NAME, SEED_ORGANIZATION_SLUG, SEED_HR_FULL_NAME, SEED_HR_USERNAME and SEED_HR_PASSWORD must be set (see .env.local.example)",
    );
  }

  // Organization is a plain data record, editable later (name/slug are not
  // hardcoded anywhere in application logic) — this seed just establishes
  // the initial value per AGENTS.md §8/§54.
  let organization = await OrganizationModel.findOne({ slug: organizationSlug });
  const isNewOrganization = !organization;
  organization ??= await OrganizationModel.create({
    name: organizationName,
    slug: organizationSlug,
  });

  // $addToSet (not $setOnInsert) for permissionKeys: re-running seed after
  // adding new baseline permissions must bring an *already-seeded* HR
  // Administrator role up to date too, not just a freshly-created one
  // (AGENTS.md §53 — explicit, idempotent backfill).
  const hrRole = await RoleModel.findOneAndUpdate(
    { organizationId: organization._id, name: "HR Administrator" },
    {
      $setOnInsert: {
        organizationId: organization._id,
        name: "HR Administrator",
        description: "Full administrative access within the organization",
      },
      $addToSet: {
        permissionKeys: { $each: BASELINE_PERMISSIONS.map((permission) => permission.key) },
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  let hrUser = await UserModel.findOne({ username: hrUsername });
  if (!hrUser) {
    const { firstName, lastName } = splitFullName(hrFullName);
    const person = await PersonModel.create({
      organizationId: organization._id,
      firstName,
      lastName,
    });
    hrUser = await UserModel.create({
      username: hrUsername,
      passwordHash: await argon2.hash(hrPassword),
      personId: person._id,
    });
  }

  await RoleAssignmentModel.findOneAndUpdate(
    { userId: hrUser._id, roleId: hrRole._id, organizationId: organization._id },
    {
      $setOnInsert: {
        userId: hrUser._id,
        roleId: hrRole._id,
        organizationId: organization._id,
        effectiveFrom: new Date(),
      },
    },
    { upsert: true },
  );

  if (isNewOrganization) {
    await AuditService.record({
      organizationId: organization._id.toString(),
      action: "organization.created",
      resourceType: "Organization",
      resourceId: organization._id.toString(),
      after: { name: organization.name, slug: organization.slug },
      metadata: { source: "seed" },
    });
  }

  console.log(`Seed complete: organization "${organization.name}" (${organization.slug}), HR user ${hrUsername}.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
