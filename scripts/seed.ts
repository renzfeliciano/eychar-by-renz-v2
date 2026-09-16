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
  PayrollRuleVersionModel,
  EmploymentTypeModel,
  EmploymentStatusModel,
  AttendanceStatusModel,
  RecruitmentStageModel,
  EventCategoryModel,
  CaseClassificationModel,
  CaseStatusModel,
  PerformanceRatingModel,
  PositionModel,
  ProjectModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
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
  { key: "employees.update", description: "Transfer employees and terminate employment", category: "workforce" },

  { key: "attendance.create", description: "Record employee attendance", category: "attendance" },
  { key: "attendance.read", description: "View attendance records", category: "attendance" },
  { key: "attendance.update", description: "Adjust attendance records", category: "attendance" },
  { key: "attendance-policies.create", description: "Create attendance policies", category: "attendance" },
  { key: "attendance-policies.read", description: "View attendance policies", category: "attendance" },
  { key: "attendance-policies.update", description: "Update attendance policies", category: "attendance" },

  { key: "leave-types.create", description: "Create leave types", category: "leave" },
  { key: "leave-types.read", description: "View leave types", category: "leave" },
  { key: "leave-types.update", description: "Update leave types", category: "leave" },
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
  { key: "payroll-runs.create", description: "Generate payroll runs", category: "payroll" },
  { key: "payroll-runs.read", description: "View payroll runs and records", category: "payroll" },
  { key: "payroll.approve", description: "Approve payroll runs", category: "payroll" },

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

  { key: "job-openings.create", description: "Create job openings", category: "recruitment" },
  { key: "job-openings.read", description: "View job openings", category: "recruitment" },
  { key: "job-openings.update", description: "Open or close job openings", category: "recruitment" },
  { key: "applicants.create", description: "Submit applicants", category: "recruitment" },
  { key: "applicants.read", description: "View applicants", category: "recruitment" },
  { key: "applicants.update", description: "Advance or reject applicants", category: "recruitment" },
  { key: "applicants.hire", description: "Hire an applicant into a real employee record", category: "recruitment" },

  { key: "review-cycles.create", description: "Create performance review cycles", category: "performance" },
  { key: "review-cycles.read", description: "View performance review cycles", category: "performance" },
  { key: "review-cycles.update", description: "Open or close performance review cycles", category: "performance" },
  { key: "performance-reviews.create", description: "Add a performance review within a cycle", category: "performance" },
  { key: "performance-reviews.read", description: "View performance reviews", category: "performance" },
  { key: "performance-reviews.update", description: "Submit a performance review", category: "performance" },
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

  // One illustrative example PayrollRuleVersion, seeded only once (never
  // re-created on a later seed run, since PayrollRuleVersionService.create
  // always auto-increments — re-running this unconditionally would pile up
  // a new version every time). PH-shaped tax brackets and named statutory
  // contributions (SSS/PhilHealth/Pag-IBIG-shaped) live here as pure seeded
  // DATA, never as hardcoded formulas in application code (AGENTS.md §28)
  // — the numbers are illustrative, not authoritative rates or tax advice.
  const hasRuleVersion = await PayrollRuleVersionModel.exists({ organizationId: organization._id });
  if (!hasRuleVersion) {
    await PayrollRuleVersionModel.create({
      organizationId: organization._id,
      versionNumber: 1,
      description: "Illustrative example rule version — not authoritative tax or contribution rates.",
      taxBrackets: [
        { minIncome: 0, maxIncome: 20833, rate: 0, baseDeduction: 0 },
        { minIncome: 20833, maxIncome: 33333, rate: 0.15, baseDeduction: 0 },
        { minIncome: 33333, maxIncome: 66667, rate: 0.2, baseDeduction: 1875 },
        { minIncome: 66667, maxIncome: 166667, rate: 0.25, baseDeduction: 13541.8 },
        { minIncome: 166667, maxIncome: 666667, rate: 0.3, baseDeduction: 38541.8 },
        { minIncome: 666667, rate: 0.35, baseDeduction: 188541.8 },
      ],
      statutoryContributions: [
        { name: "SSS", employeeRate: 0.045, cap: 30000 },
        { name: "PhilHealth", employeeRate: 0.025, cap: 100000 },
        { name: "Pag-IBIG", employeeRate: 0.02, cap: 10000 },
      ],
    });
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
    }
  }

  await seedCatalogDefaults(EmploymentTypeModel, [
    { code: "regular", name: "Regular", sortOrder: 0 },
    { code: "probationary", name: "Probationary", sortOrder: 1 },
    { code: "contractual", name: "Contractual", sortOrder: 2 },
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
