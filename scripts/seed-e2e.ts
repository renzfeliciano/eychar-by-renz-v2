/**
 * Prepares a throwaway database for the Playwright tests (tests/e2e) in one
 * step, with no manual sign-in afterwards:
 *
 *   E2E_MONGODB_URI=mongodb://127.0.0.1:27017/eychar_e2e \
 *   E2E_USERNAME=hr.e2e E2E_PASSWORD=... \
 *   E2E_APPROVER_USERNAME=approver.e2e E2E_APPROVER_PASSWORD=... \
 *   npx tsx scripts/seed-e2e.ts
 *
 * It runs the normal seed (scripts/seed.ts), then makes the HR account usable
 * with E2E_PASSWORD, keeps two-step off and the idle limit at one minute for
 * the organization, hires one employee with pay terms, and adds a second
 * staff account that can approve payroll. Safe to run again: everything is
 * looked up before it's created. Like the tests themselves, it refuses any
 * database that isn't local or named for tests (tests/e2e/global-setup.ts).
 *
 * Never reads .env.local, so it can't reach the database configured there.
 */
import mongoose from "mongoose";
import argon2 from "argon2";
import { assertSafeE2EDatabase } from "../tests/e2e/global-setup";
import { checkPassword } from "@/shared/validation/password-policy";
import { createStaffAccountSchema } from "@/shared/validation/auth";
import { assignRoleSchema, createRoleSchema } from "@/shared/validation/roles";
import { hireEmployeeSchema } from "@/shared/validation/workforce";
import { createCompensationSchema } from "@/shared/validation/payroll";
import { CompensationModel, EmployeeModel, LoginThrottleModel, PositionModel, ProjectModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { StaffAccountService } from "@/domains/identity/staff-account-service";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { HireService } from "@/domains/workforce/hire-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollRuleVersionService } from "@/domains/payroll/payroll-rule-version-service";
import { dateKeyToDate } from "@/lib/date-key";
import { seed } from "./seed";

const APPROVER_ROLE = "E2E Payroll Approver";
const APPROVER_PERMISSIONS = ["payroll-runs.read", "payroll.approve"];
const EMPLOYEE_NUMBER = "E2E-0001";
// Employment, pay terms, policy and rule version all start here, so any
// period the payroll test picks (2090s) resolves them.
const EFFECTIVE_FROM = "2025-01-01";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} (see tests/e2e/README.md).`);
  return value;
}

function assertPasswordPolicy(name: string, password: string, username: string) {
  const problems = checkPassword(password, { username });
  if (problems.length) throw new Error(`${name} doesn't meet the password policy: ${problems.join(" ")}`);
}

/** Signs in with exactly this password from now on: no forced change, no lock, no leftover session or two-step. */
async function makeSignInReady(userId: unknown, password: string) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { passwordHash: await argon2.hash(password), passwordChangedAt: new Date(), mustChangePassword: false, status: "active", failedSignInCount: 0 },
      $unset: { lockedUntil: 1, activeSessionId: 1, mfa: 1 },
    },
  );
}

async function ensureApprover(organizationId: string, username: string, password: string) {
  let role = await RoleModel.findOne({ organizationId, name: APPROVER_ROLE });
  if (!role) {
    role = await RoleService.create(
      createRoleSchema.parse({ organizationId, name: APPROVER_ROLE, description: "End-to-end tests: approves payroll runs", permissionKeys: APPROVER_PERMISSIONS }),
      {},
    );
  } else {
    await RoleModel.updateOne({ _id: role._id }, { $addToSet: { permissionKeys: { $each: APPROVER_PERMISSIONS } }, $set: { status: "active" } });
  }
  const roleId = role._id.toString();

  let user = await UserModel.findOne({ username });
  if (!user) {
    user = await StaffAccountService.create(
      createStaffAccountSchema.parse({ organizationId, firstName: "E2E", lastName: "Approver", username, password, roleId }),
      {},
    );
  } else {
    const now = new Date();
    const holdsRole = await RoleAssignmentModel.exists({
      userId: user._id,
      roleId: role._id,
      organizationId: new mongoose.Types.ObjectId(organizationId),
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    });
    if (!holdsRole) await RoleAssignmentService.assign(assignRoleSchema.parse({ organizationId, roleId, userId: user._id.toString() }), {});
  }
  await makeSignInReady(user._id, password);
}

async function ensureEmployeeWithPayTerms(organizationId: string) {
  let employee = await EmployeeModel.findOne({ organizationId, employeeNumber: EMPLOYEE_NUMBER }).select("_id").lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (!employee) {
    const [position, project] = await Promise.all([
      PositionModel.findOne({ organizationId, status: "active" }).sort({ code: 1 }).select("_id").lean<{ _id: mongoose.Types.ObjectId } | null>(),
      ProjectModel.findOne({ organizationId, status: "active" }).sort({ code: 1 }).select("_id").lean<{ _id: mongoose.Types.ObjectId } | null>(),
    ]);
    const hired = await HireService.hire(
      hireEmployeeSchema.parse({
        organizationId,
        firstName: "Erin",
        lastName: "Endtoend",
        employeeNumber: EMPLOYEE_NUMBER,
        employmentType: "regular",
        positionId: position?._id.toString(),
        projectId: project?._id.toString(),
        effectiveFrom: EFFECTIVE_FROM,
      }),
      {},
    );
    employee = { _id: hired.employee._id };
  }
  const employeeId = employee._id.toString();
  if (!(await CompensationModel.exists({ organizationId, employeeId }))) {
    await CompensationService.create(
      createCompensationSchema.parse({ organizationId, employeeId, rateType: "monthly", rate: 30_000, effectiveFrom: EFFECTIVE_FROM, reason: "End-to-end test data" }),
      {},
    );
  }
}

/** Fails here, with a clear message, rather than halfway through the payroll test. */
async function assertPayrollResolves(organizationId: string) {
  for (const dateKey of ["2090-01-01", "2098-12-31"]) {
    const effectiveDate = dateKeyToDate(dateKey);
    if (!(await PayrollPolicyService.resolve({ organizationId, effectiveDate }))) throw new Error(`No payroll policy applies on ${dateKey}`);
    if (!(await PayrollRuleVersionService.resolve({ organizationId, effectiveDate }))) throw new Error(`No payroll rule version applies on ${dateKey}`);
  }
}

async function seedE2E() {
  const uri = assertSafeE2EDatabase(process.env.E2E_MONGODB_URI);
  const username = required("E2E_USERNAME").toLowerCase();
  const password = required("E2E_PASSWORD");
  assertPasswordPolicy("E2E_PASSWORD", password, username);
  const approverUsername = process.env.E2E_APPROVER_USERNAME?.trim().toLowerCase();
  const approverPassword = process.env.E2E_APPROVER_PASSWORD;
  if (Boolean(approverUsername) !== Boolean(approverPassword)) throw new Error("Set both E2E_APPROVER_USERNAME and E2E_APPROVER_PASSWORD, or neither.");
  if (approverUsername && approverPassword) assertPasswordPolicy("E2E_APPROVER_PASSWORD", approverPassword, approverUsername);

  // The normal seed reads these; the E2E account is its HR account.
  process.env.MONGODB_URI = uri;
  process.env.SEED_ORGANIZATION_NAME ??= "E2E Organization";
  process.env.SEED_ORGANIZATION_SLUG ??= "e2e";
  process.env.SEED_HR_FULL_NAME ??= "E2E HR Administrator";
  process.env.SEED_HR_USERNAME = username;
  process.env.SEED_HR_PASSWORD = password;

  const { organizationId, hrUserId } = await seed();

  await makeSignInReady(hrUserId, password);
  // The defaults (1-minute idle limit, 15-second warning, no two-step), set
  // explicitly so a value changed by hand in this database doesn't linger.
  await SecuritySettingsService.update(organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 15, requireTwoStepForStaff: false }, { userId: hrUserId });
  await assertPayrollResolves(organizationId);
  await ensureEmployeeWithPayTerms(organizationId);
  if (approverUsername && approverPassword) await ensureApprover(organizationId, approverUsername, approverPassword);
  else console.warn("E2E_APPROVER_USERNAME/E2E_APPROVER_PASSWORD not set: no approver account, so the payroll test skips its approval step.");
  // Earlier runs' wrong-password attempts shouldn't throttle this one.
  await LoginThrottleModel.deleteMany({});

  console.log(`E2E seed complete: HR ${username}${approverUsername ? `, approver ${approverUsername}` : ""}, employee ${EMPLOYEE_NUMBER}.`);
}

seedE2E()
  .catch((error: unknown) => {
    console.error("E2E seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
