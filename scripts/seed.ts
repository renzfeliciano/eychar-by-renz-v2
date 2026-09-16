import mongoose from "mongoose";
import { config } from "dotenv";
import { hash } from "bcryptjs";
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

// Phase 1 baseline permission catalog. This is seeded *data*, not
// hardcoded authorization logic — new permission keys are added here as
// later phases introduce the domains that need them (AGENTS.md §54).
const BASELINE_PERMISSIONS = [
  { key: "organization.manage", description: "Create and manage organizations" },
  { key: "users.manage", description: "Create and manage user accounts" },
  { key: "roles.manage", description: "Create and manage roles and role assignments" },
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

async function seed() {
  await connectMongoDB();
  await upsertPermissionCatalog();

  const organizationName = process.env.SEED_ORGANIZATION_NAME;
  const organizationSlug = process.env.SEED_ORGANIZATION_SLUG;
  const hrEmail = process.env.SEED_HR_EMAIL?.trim().toLowerCase();
  const hrPassword = process.env.SEED_HR_PASSWORD;

  if (!organizationName || !organizationSlug || !hrEmail || !hrPassword) {
    throw new Error(
      "SEED_ORGANIZATION_NAME, SEED_ORGANIZATION_SLUG, SEED_HR_EMAIL and SEED_HR_PASSWORD must be set (see .env.local.example)",
    );
  }

  let organization = await OrganizationModel.findOne({ slug: organizationSlug });
  const isNewOrganization = !organization;
  organization ??= await OrganizationModel.create({
    name: organizationName,
    slug: organizationSlug,
  });

  const hrRole = await RoleModel.findOneAndUpdate(
    { organizationId: organization._id, name: "HR Administrator" },
    {
      $setOnInsert: {
        organizationId: organization._id,
        name: "HR Administrator",
        description: "Full administrative access within the organization",
        permissionKeys: BASELINE_PERMISSIONS.map((permission) => permission.key),
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  let hrUser = await UserModel.findOne({ email: hrEmail });
  if (!hrUser) {
    const person = await PersonModel.create({
      organizationId: organization._id,
      firstName: "HR",
      lastName: "Administrator",
      email: hrEmail,
    });
    hrUser = await UserModel.create({
      email: hrEmail,
      passwordHash: await hash(hrPassword, 12),
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

  console.log(`Seed complete: organization "${organization.name}" (${organization.slug}), HR user ${hrEmail}.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
