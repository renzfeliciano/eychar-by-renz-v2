import mongoose from "mongoose";
import { config } from "dotenv";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import {
  OrganizationModel,
  PermissionModel,
  RoleModel,
  UserModel,
  PersonModel,
  RoleAssignmentModel,
  PayrollRuleVersionModel,
  PayrollPolicyModel,
  EmploymentTypeModel,
  EmploymentStatusModel,
  AttendanceStatusModel,
  RecruitmentStageModel,
  EventCategoryModel,
  CaseClassificationModel,
  CaseStatusModel,
  PerformanceRatingModel,
  DocumentTypeModel,
  ClearanceDepartmentModel,
  SeparationTypeModel,
  ClearanceChecklistItemModel,
  PaymentMethodModel,
  PositionModel,
  ProjectModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import type { Model } from "mongoose";

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
  { key: "employees.update", description: "Edit employee details, transfer employees, and terminate employment", category: "workforce" },

  { key: "attendance.create", description: "Record employee attendance", category: "attendance" },
  { key: "attendance.read", description: "View attendance records", category: "attendance" },
  { key: "attendance.update", description: "Adjust attendance records", category: "attendance" },
  { key: "attendance-policies.create", description: "Create attendance policies", category: "attendance" },
  { key: "attendance-policies.read", description: "View attendance policies", category: "attendance" },
  { key: "attendance-policies.update", description: "Update attendance policies", category: "attendance" },

  { key: "leave-types.create", description: "Create leave types", category: "leave" },
  { key: "leave-types.read", description: "View leave types", category: "leave" },
  { key: "leave-types.update", description: "Update leave types", category: "leave" },
  { key: "leave-types.delete", description: "Delete unused leave types", category: "leave" },
  { key: "leave-policies.create", description: "Create leave policies", category: "leave" },
  { key: "leave-policies.read", description: "View leave policies", category: "leave" },
  { key: "leave-policies.update", description: "Update leave policies", category: "leave" },
  { key: "leave-balances.create", description: "Grant leave balances", category: "leave" },
  { key: "leave-balances.read", description: "View leave balances", category: "leave" },
  { key: "leave-balances.update", description: "Adjust leave balances", category: "leave" },
  { key: "leave.create", description: "Submit leave requests", category: "leave" },
  { key: "leave.read", description: "View leave requests", category: "leave" },
  { key: "leave.update", description: "Cancel leave requests", category: "leave" },
  { key: "leave.approve", description: "Approve or reject leave requests", category: "leave" },

  { key: "payroll-policies.create", description: "Create payroll policies", category: "payroll" },
  { key: "payroll-policies.read", description: "View payroll policies", category: "payroll" },
  { key: "payroll-policies.update", description: "Update payroll policies", category: "payroll" },
  { key: "payroll-rule-versions.create", description: "Create payroll rule versions", category: "payroll" },
  { key: "payroll-rule-versions.read", description: "View payroll rule versions", category: "payroll" },
  { key: "payroll-rule-versions.update", description: "Retire payroll rule versions", category: "payroll" },
  { key: "compensation.create", description: "Grant employee compensation", category: "payroll" },
  { key: "compensation.read", description: "View employee compensation", category: "payroll" },
  { key: "compensation.update", description: "Revise employee compensation", category: "payroll" },
  { key: "payroll-runs.create", description: "Prepare payroll runs", category: "payroll" },
  { key: "payroll-runs.read", description: "View payroll runs, payslips and registers", category: "payroll" },
  { key: "payroll-runs.update", description: "Edit, recompute, submit and cancel draft payroll runs", category: "payroll" },
  { key: "payroll.approve", description: "Approve or return payroll runs", category: "payroll" },
  { key: "payroll.release", description: "Release approved payroll runs as paid", category: "payroll" },
  { key: "payroll-schedules.create", description: "Create payroll schedules", category: "payroll" },
  { key: "payroll-schedules.read", description: "View payroll schedules", category: "payroll" },
  { key: "payroll-schedules.update", description: "Update payroll schedules", category: "payroll" },

  { key: "employment-types.create", description: "Add employment type catalog items", category: "settings" },
  { key: "employment-types.read", description: "View employment type catalog items", category: "settings" },
  { key: "employment-types.update", description: "Retire employment type catalog items", category: "settings" },
  { key: "employment-statuses.create", description: "Add employment status catalog items", category: "settings" },
  { key: "employment-statuses.read", description: "View employment status catalog items", category: "settings" },
  { key: "employment-statuses.update", description: "Retire employment status catalog items", category: "settings" },
  { key: "attendance-statuses.create", description: "Add attendance status catalog items", category: "settings" },
  { key: "attendance-statuses.read", description: "View attendance status catalog items", category: "settings" },
  { key: "attendance-statuses.update", description: "Retire attendance status catalog items", category: "settings" },
  { key: "recruitment-stages.create", description: "Add recruitment stage catalog items", category: "settings" },
  { key: "recruitment-stages.read", description: "View recruitment stage catalog items", category: "settings" },
  { key: "recruitment-stages.update", description: "Retire recruitment stage catalog items", category: "settings" },
  { key: "event-categories.create", description: "Add event category catalog items", category: "settings" },
  { key: "event-categories.read", description: "View event category catalog items", category: "settings" },
  { key: "event-categories.update", description: "Retire event category catalog items", category: "settings" },
  { key: "case-classifications.create", description: "Add case classification catalog items", category: "settings" },
  { key: "case-classifications.read", description: "View case classification catalog items", category: "settings" },
  { key: "case-classifications.update", description: "Retire case classification catalog items", category: "settings" },
  { key: "case-statuses.create", description: "Add case status catalog items", category: "settings" },
  { key: "case-statuses.read", description: "View case status catalog items", category: "settings" },
  { key: "case-statuses.update", description: "Retire case status catalog items", category: "settings" },
  { key: "performance-ratings.create", description: "Add performance rating catalog items", category: "settings" },
  { key: "performance-ratings.read", description: "View performance rating catalog items", category: "settings" },
  { key: "performance-ratings.update", description: "Retire performance rating catalog items", category: "settings" },

  { key: "applicants.create", description: "Add applicants", category: "recruitment" },
  { key: "applicants.read", description: "View applicants", category: "recruitment" },
  { key: "applicants.update", description: "Edit applicants and move them between pipeline stages", category: "recruitment" },

  { key: "review-cycles.create", description: "Create performance review cycles", category: "performance" },
  { key: "review-cycles.read", description: "View performance review cycles", category: "performance" },
  { key: "review-cycles.update", description: "Open or close performance review cycles", category: "performance" },
  { key: "performance-reviews.create", description: "Add a performance review within a cycle", category: "performance" },
  { key: "performance-reviews.read", description: "View performance reviews", category: "performance" },
  { key: "performance-reviews.update", description: "Submit a performance review", category: "performance" },

  { key: "cases.create", description: "Add a case", category: "cases" },
  { key: "cases.read", description: "View cases", category: "cases" },
  { key: "cases.update", description: "Update a case's status or notes", category: "cases" },

  { key: "travel-orders.create", description: "Dispatch employees on a travel order", category: "travel-orders" },
  { key: "travel-orders.read", description: "View travel orders", category: "travel-orders" },
  { key: "travel-orders.update", description: "Edit or cancel a travel order", category: "travel-orders" },

  { key: "asset-issuances.create", description: "Log a company asset issued to an employee", category: "assets" },
  { key: "asset-issuances.read", description: "View an employee's issued assets", category: "assets" },
  { key: "asset-issuances.update", description: "Edit an asset issuance record", category: "assets" },

  { key: "roles.create", description: "Create custom roles", category: "access" },
  { key: "roles.read", description: "View roles and who holds them", category: "access" },
  { key: "roles.update", description: "Edit a role's permissions or retire it", category: "access" },
  { key: "roles.assign", description: "Assign or revoke a role for a user", category: "access" },
  { key: "staff-accounts.create", description: "Create an additional HR/admin login", category: "access" },
  { key: "users.read", description: "View accounts and their security state", category: "access" },
  { key: "users.update", description: "Reset passwords, unlock, disable accounts and reset two-step verification", category: "access" },
  { key: "audit-logs.read", description: "View the audit log", category: "access" },

  { key: "events.create", description: "Add a calendar event", category: "events" },
  { key: "events.read", description: "View calendar events", category: "events" },
  { key: "events.update", description: "Edit or cancel a calendar event", category: "events" },

  { key: "document-types.create", description: "Add document type catalog items", category: "settings" },
  { key: "document-types.read", description: "View document type catalog items", category: "settings" },
  { key: "document-types.update", description: "Retire document type catalog items", category: "settings" },

  { key: "employee-documents.create", description: "Upload an employee document", category: "documents" },
  { key: "employee-documents.read", description: "View and download an employee's documents", category: "documents" },
  { key: "employee-documents.update", description: "Edit an employee document's details", category: "documents" },

  // Workforce clearance (ADR-031).
  { key: "clearance.read", description: "View clearances", category: "clearance" },
  { key: "clearance.create", description: "Open a clearance for a separating employee", category: "clearance" },
  { key: "clearance.sign-off", description: "Clear, flag or mark checklist items not applicable", category: "clearance" },
  { key: "clearance.waive", description: "Waive a clearance item (with a reason)", category: "clearance" },
  { key: "clearance.update", description: "Cancel a clearance and manage the clearance checklist", category: "clearance" },
  { key: "clearance-departments.create", description: "Add clearance departments", category: "settings" },
  { key: "clearance-departments.read", description: "View clearance departments", category: "settings" },
  { key: "clearance-departments.update", description: "Retire clearance departments", category: "settings" },
  { key: "separation-types.create", description: "Add separation types", category: "settings" },
  { key: "separation-types.read", description: "View separation types", category: "settings" },
  { key: "separation-types.update", description: "Retire separation types", category: "settings" },

  // Final settlement (ADR-032).
  { key: "final-settlements.read", description: "View final settlements", category: "final settlement" },
  { key: "final-settlements.prepare", description: "Prepare, recompute and submit a final settlement", category: "final settlement" },
  { key: "final-settlements.review", description: "Review a final settlement (or return it for correction)", category: "final settlement" },
  { key: "final-settlements.approve", description: "Approve a final settlement", category: "final settlement" },
  { key: "final-settlements.disburse", description: "Record a final settlement as paid", category: "final settlement" },
  { key: "payment-methods.create", description: "Add payment methods", category: "settings" },
  { key: "payment-methods.read", description: "View payment methods", category: "settings" },
  { key: "payment-methods.update", description: "Retire payment methods", category: "settings" },
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
  "job-openings.create",
  "job-openings.read",
  "job-openings.update",
  "applicants.hire",
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
        // Delete permissions are the Super Administrator's alone (ADR-033), never an ordinary role's.
        permissionKeys: { $each: BASELINE_PERMISSIONS.map((permission) => permission.key).filter((key) => !key.endsWith(".delete")) },
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  // Take any delete permission back from every ordinary role (e.g. leave-types.delete granted before this rule).
  await RoleModel.updateMany(
    { organizationId: organization._id, system: { $ne: "super_admin" } },
    { $pull: { permissionKeys: { $in: BASELINE_PERMISSIONS.map((permission) => permission.key).filter((key) => key.endsWith(".delete")) } } },
  );

  // Backfills `status` onto every role seeded before that field existed
  // (AGENTS.md §53) — authorize() already treats a missing status as
  // active, so this is cleanup, not a correctness fix.
  await RoleModel.updateMany({ status: { $exists: false } }, { $set: { status: "active" } });

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

  // Payroll starters (ADR-029), as editable DATA, never formulas in code
  // (AGENTS.md §28): the Philippine 2025 statutory tables as a rule version,
  // and a semi-monthly policy. Each is created only when the organization
  // has none of its own. Older rule versions without withholding tables
  // (the pre-ADR-029 example) are retired so they can't resolve for a run.
  const legacyRuleVersions = await PayrollRuleVersionModel.find({ organizationId: organization._id, status: "active", "taxTables.0": { $exists: false } });
  for (const legacy of legacyRuleVersions) {
    legacy.status = "inactive";
    legacy.effectiveTo = new Date();
    await legacy.save({ validateBeforeSave: false });
    await AuditService.record({
      organizationId: organization._id.toString(),
      action: "payroll-rule-version.updated",
      resourceType: "PayrollRuleVersion",
      resourceId: legacy._id.toString(),
      before: { status: "active" },
      after: { status: "inactive" },
      metadata: { source: "seed", reason: "Replaced by the rule version format with withholding tables" },
    });
  }
  const hasCurrentRuleVersion = await PayrollRuleVersionModel.exists({ organizationId: organization._id, "taxTables.0": { $exists: true } });
  if (!hasCurrentRuleVersion) {
    await PayrollRuleVersionService.create(
      { organizationId: organization._id.toString(), ...PH_STATUTORY_2025, effectiveFrom: "2025-01-01" },
      {},
    );
  }
  // Policies made before the final-pay deadline setting existed get the PH statutory 30 days (editable per policy).
  await PayrollPolicyModel.updateMany({ organizationId: organization._id, finalPayDeadlineDays: { $exists: false } }, { $set: { finalPayDeadlineDays: 30 } });
  if (!(await PayrollPolicyModel.exists({ organizationId: organization._id }))) {
    await PayrollPolicyService.create(
      {
        organizationId: organization._id.toString(),
        name: "Standard semi-monthly",
        payFrequency: "semi-monthly",
        workDaysPerYear: 261,
        hoursPerDay: 8,
        finalPayDeadlineDays: 30,
        workWeekDays: [1, 2, 3, 4, 5],
        deductLateAndUndertime: true,
        contributionTiming: "every_cutoff",
        effectiveFrom: "2025-01-01",
      },
      {},
    );
  }

  // Default catalog items, sourced from the v1 (legacy) app's real
  // "Workspace administration" lookup lists as a starter set (per explicit
  // instruction: seed these as data, not as hardcoded application logic —
  // AGENTS.md §30). Each item is upserted by {organizationId, code} so
  // re-running db:seed never duplicates or trips the unique index, while
  // still leaving room for the org to add further items of its own through
  // the Settings > Catalogs UI.
  async function seedCatalogDefaults(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CatalogModel: Model<any>,
    items: Array<{ code: string; name: string; sortOrder: number; metadata?: Record<string, unknown> }>,
  ) {
    for (const item of items) {
      await CatalogModel.findOneAndUpdate(
        { organizationId: organization._id, code: item.code },
        {
          $setOnInsert: {
            organizationId: organization._id,
            code: item.code,
            name: item.name,
            sortOrder: item.sortOrder,
            metadata: item.metadata ?? {},
            status: "active",
          },
        },
        { upsert: true },
      );

      // Backfill new metadata keys onto an item that already existed
      // before that key was introduced (e.g. requiresEndOfContract added
      // after Contractual/Probationary were already seeded on real
      // clusters) — $setOnInsert above only helps brand-new documents.
      // Guarded per-key so an org's own edit to that key is never
      // overwritten by a later seed run.
      for (const [key, value] of Object.entries(item.metadata ?? {})) {
        await CatalogModel.updateOne(
          { organizationId: organization._id, code: item.code, [`metadata.${key}`]: { $exists: false } },
          { $set: { [`metadata.${key}`]: value } },
        );
      }
    }
  }

  await seedCatalogDefaults(EmploymentTypeModel, [
    { code: "regular", name: "Regular", sortOrder: 0 },
    { code: "probationary", name: "Probationary", sortOrder: 1, metadata: { requiresEndOfContract: true } },
    { code: "contractual", name: "Contractual", sortOrder: 2, metadata: { requiresEndOfContract: true } },
    { code: "transfer", name: "Transfer", sortOrder: 3 },
  ]);

  await seedCatalogDefaults(EmploymentStatusModel, [
    { code: "active", name: "Active", sortOrder: 0, metadata: { isActiveHeadcount: true } },
    { code: "on_leave", name: "On Leave", sortOrder: 1, metadata: { isActiveHeadcount: true } },
    { code: "terminated", name: "Terminated", sortOrder: 2, metadata: { isActiveHeadcount: false } },
    { code: "resigned", name: "Resigned", sortOrder: 3, metadata: { isActiveHeadcount: false } },
    { code: "awol", name: "AWOL", sortOrder: 4, metadata: { isActiveHeadcount: false } },
  ]);

  await seedCatalogDefaults(AttendanceStatusModel, [
    { code: "present", name: "Present", sortOrder: 0 },
    { code: "late", name: "Late", sortOrder: 1 },
    { code: "absent", name: "Absent", sortOrder: 2 },
    { code: "on_leave", name: "On Leave", sortOrder: 3 },
    { code: "offset", name: "Offset", sortOrder: 4 },
    { code: "half_day", name: "Half-day", sortOrder: 5 },
    { code: "day_off", name: "Day off", sortOrder: 6 },
    { code: "restday_work", name: "Restday work", sortOrder: 7 },
    { code: "holiday_work", name: "Holiday work", sortOrder: 8 },
    { code: "undertime", name: "Undertime", sortOrder: 9 },
    { code: "tardy_late", name: "Tardy/Late", sortOrder: 10 },
  ]);

  await seedCatalogDefaults(RecruitmentStageModel, [
    { code: "applied", name: "Applied", sortOrder: 0 },
    { code: "screening", name: "Screening", sortOrder: 1 },
    { code: "interview", name: "Interview", sortOrder: 2 },
    { code: "offer", name: "Offer", sortOrder: 3 },
    { code: "hired", name: "Hired", sortOrder: 4, metadata: { isTerminal: true } },
    { code: "rejected", name: "Rejected", sortOrder: 5, metadata: { isTerminal: true } },
  ]);

  await seedCatalogDefaults(EventCategoryModel, [
    { code: "meeting", name: "Meeting", sortOrder: 0 },
    { code: "holiday", name: "Holiday", sortOrder: 1 },
    { code: "deadline", name: "Deadline", sortOrder: 2 },
    { code: "reminder", name: "Reminder", sortOrder: 3 },
    { code: "other", name: "Other", sortOrder: 4 },
  ]);

  await seedCatalogDefaults(CaseClassificationModel, [
    { code: "sena_labor_case", name: "SeNA/Labor Case", sortOrder: 0 },
    { code: "criminal_case", name: "Criminal Case", sortOrder: 1 },
    { code: "civil_case", name: "Civil Case", sortOrder: 2 },
    { code: "hlurb_dshud", name: "HLURB/DSHUD", sortOrder: 3 },
    { code: "others", name: "Others", sortOrder: 4 },
  ]);

  await seedCatalogDefaults(CaseStatusModel, [
    { code: "mediation", name: "Mediation", sortOrder: 0 },
    { code: "ongoing", name: "Ongoing", sortOrder: 1 },
    { code: "pending", name: "Pending", sortOrder: 2 },
    { code: "dismissed", name: "Dismissed", sortOrder: 3 },
  ]);

  await seedCatalogDefaults(PerformanceRatingModel, [
    { code: "needs_improvement", name: "Needs Improvement", sortOrder: 0 },
    { code: "meets_expectations", name: "Meets Expectations", sortOrder: 1 },
    { code: "exceeds_expectations", name: "Exceeds Expectations", sortOrder: 2 },
    { code: "outstanding", name: "Outstanding", sortOrder: 3 },
  ]);

  await seedCatalogDefaults(DocumentTypeModel, [
    { code: "government-id", name: "Government ID", sortOrder: 0 },
    { code: "contract", name: "Employment Contract", sortOrder: 1 },
    { code: "certification", name: "Certification", sortOrder: 2 },
    { code: "resume", name: "Resume", sortOrder: 3 },
    { code: "other", name: "Other", sortOrder: 4 },
  ]);

  await seedCatalogDefaults(ClearanceDepartmentModel, [
    { code: "supervisor", name: "Immediate supervisor", sortOrder: 0 },
    { code: "admin", name: "Admin", sortOrder: 1 },
    { code: "it", name: "IT", sortOrder: 2 },
    { code: "finance", name: "Finance", sortOrder: 3 },
    { code: "hr", name: "HR", sortOrder: 4 },
  ]);

  await seedCatalogDefaults(SeparationTypeModel, [
    { code: "resignation", name: "Resignation", sortOrder: 0 },
    { code: "end_of_contract", name: "End of contract", sortOrder: 1 },
    { code: "termination", name: "Termination", sortOrder: 2 },
    { code: "retirement", name: "Retirement", sortOrder: 3 },
    { code: "redundancy", name: "Redundancy", sortOrder: 4 },
    { code: "death", name: "Death", sortOrder: 5 },
  ]);

  await seedCatalogDefaults(PaymentMethodModel, [
    { code: "bank_transfer", name: "Bank transfer", sortOrder: 0 },
    { code: "check", name: "Check", sortOrder: 1 },
    { code: "cash", name: "Cash", sortOrder: 2 },
  ]);

  // Starter clearance checklist (ADR-031), only for an organization that has none yet,
  // so re-running the seed never re-adds items HR has edited or retired.
  if (!(await ClearanceChecklistItemModel.exists({ organizationId: organization._id }))) {
    const CHECKLIST = [
      { departmentCode: "supervisor", title: "Turnover of work and files", blocking: true, dueDaysAfterLastDay: 0 },
      { departmentCode: "admin", title: "Return company ID, keys and uniforms", blocking: true, dueDaysAfterLastDay: 0 },
      { departmentCode: "it", title: "Return all issued company assets", blocking: true, dueDaysAfterLastDay: 0, autoSource: "assets" },
      { departmentCode: "it", title: "Revoke system and email access", blocking: true, dueDaysAfterLastDay: 1, autoSource: "account_access" },
      { departmentCode: "finance", title: "Liquidate cash advances and travel orders", blocking: true, dueDaysAfterLastDay: 3, autoSource: "travel_orders" },
      { departmentCode: "finance", title: "Compute accountabilities (lost or damaged items, loans)", blocking: true, dueDaysAfterLastDay: 5 },
      { departmentCode: "hr", title: "Review leave balance", blocking: false, dueDaysAfterLastDay: 3 },
      { departmentCode: "hr", title: "Exit interview", blocking: false, dueDaysAfterLastDay: 3 },
    ];
    await ClearanceChecklistItemModel.insertMany(CHECKLIST.map((item, index) => ({ organizationId: organization._id, ...item, sortOrder: index })));
  }
  // Phase 2 (automatic checks): wire the original default items to their sources, only where
  // HR hasn't changed them (same title, no source yet).
  for (const [title, update] of [
    ["Return laptop, phone and accessories", { title: "Return all issued company assets", autoSource: "assets" }],
    ["Revoke system and email access", { autoSource: "account_access" }],
    ["Liquidate cash advances and travel orders", { autoSource: "travel_orders" }],
  ] as const) {
    await ClearanceChecklistItemModel.updateOne({ organizationId: organization._id, title, autoSource: { $exists: false } }, { $set: update });
  }

  // Real Position/Project data from the v1 app, seeded as a starter set for
  // the "pcas" organization. Codes are generated (v1's own admin screen
  // doesn't expose one) and upserted by {organizationId, code} so re-running
  // db:seed never duplicates existing rows.
  const POSITION_DEFAULTS = [
    { code: "PARKING-ATTENDANT", title: "Parking Attendant" },
    { code: "OJT-INTERN", title: "OJT/Intern" },
    { code: "ON-CALL", title: "On-Call" },
    { code: "PRESIDENT", title: "President" },
    { code: "OPS-MANAGER", title: "Operations Manager" },
    { code: "ADMIN-HEAD", title: "Administrative Head" },
    { code: "HR-GENERALIST", title: "HR Generalist/Paralegal" },
    { code: "ACCTG-FINANCE-GENERALIST", title: "Accounting and Finance Generalist" },
    { code: "BLDG-ADMIN", title: "Building Administrator/Property Manager" },
    { code: "BLDG-ENGINEER", title: "Building Engineer" },
    { code: "PROJECT-BOOKKEEPER", title: "Project Bookkeeper" },
    { code: "BILLING-CASHIER", title: "Billing/Cashier Staff" },
    { code: "FRONT-DESK", title: "Front Desk Staff" },
    { code: "MAINTENANCE-HANDYMAN", title: "Maintenance/Handyman" },
    { code: "HOUSEKEEPER", title: "Housekeeper" },
    { code: "ACCTG-HEAD", title: "Accounting Head" },
  ];
  for (const position of POSITION_DEFAULTS) {
    await PositionModel.findOneAndUpdate(
      { organizationId: organization._id, code: position.code },
      { $setOnInsert: { organizationId: organization._id, code: position.code, title: position.title, status: "active" } },
      { upsert: true },
    );
  }

  const PROJECT_DEFAULTS = [
    { code: "EGI-RUFINO", name: "EGI Rufino" },
    { code: "PCAS-HO", name: "PCAS – HO" },
    { code: "EGI-TAFT-TOWER", name: "EGI Taft Tower" },
    { code: "IVORY-COURT", name: "Ivory Court" },
    { code: "EGI-HOMES-MEDINA", name: "EGI Homes Medina" },
    { code: "TRINITY-PLAZA-T1", name: "Trinity Plaza Tower 1" },
    { code: "MACTAN-OASIS-GARDENS", name: "Mactan Oasis Gardens" },
    { code: "EGI-CBTS-1", name: "EGI City by the Sea Building I" },
    { code: "EGI-CBTS-2", name: "EGI City by the Sea Building II" },
    { code: "EGI-CBTS-3", name: "EGI City by the Sea Building III" },
    { code: "SOUTH-INSULA", name: "South Insula" },
    { code: "WEST-INSULA", name: "West Insula" },
    { code: "UNIVERSITY-SUITES", name: "University Suites" },
    { code: "ESTRELLA-CONDO", name: "Estrella Condominium Corporation" },
    { code: "EGI-ALBERGO-FERROCA", name: "EGI Albergo Di Ferroca" },
    { code: "METRO-TERRACES", name: "Metropolitan Terraces Condominium" },
  ];
  for (const project of PROJECT_DEFAULTS) {
    await ProjectModel.findOneAndUpdate(
      { organizationId: organization._id, code: project.code },
      { $setOnInsert: { organizationId: organization._id, code: project.code, name: project.name, status: "active" } },
      { upsert: true },
    );
  }

  // The one Super Administrator: the seed's HR account. Refuses if someone else already holds it.
  await SuperAdminService.ensure(organization._id.toString(), hrUser._id.toString());

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
