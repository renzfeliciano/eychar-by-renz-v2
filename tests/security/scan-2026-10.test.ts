import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeAssignmentModel, EmployeeModel, OrganizationModel, PermissionModel, PersonModel, PositionModel, ProjectModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { RoleService } from "@/domains/authorization/role-service";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { toErrorResponse } from "@/shared/errors/to-response";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { Types } from "mongoose";

// Regression tests for the October 2026 security review (ADR-040).
const unique = () => `${Date.now()}-${Math.random()}`;

async function org(name = "Acme") {
  return OrganizationModel.create({ name, slug: `sec-${unique()}` });
}
async function employeeIn(organizationId: Types.ObjectId) {
  const person = await PersonModel.create({ organizationId, firstName: "Ana", lastName: "Reyes" });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `E-${unique()}` });
}
async function permission(key: string) {
  await PermissionModel.findOneAndUpdate({ key }, { $setOnInsert: { key, description: key, category: "test" } }, { upsert: true });
}
async function staffWith(organizationId: Types.ObjectId, keys: string[]) {
  const user = await UserModel.create({ username: `staff.${unique()}`, passwordHash: "x" });
  const role = await RoleModel.create({ organizationId, name: `R ${unique()}`, permissionKeys: keys });
  await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: user._id });
  return { userId: user._id.toString(), roleId: role._id.toString() };
}

describe("October 2026 security review", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("refuses to move or read another organization's employee through assignments", async () => {
    const a = await org("A");
    const b = await org("B");
    const foreign = await employeeIn(b._id);
    const position = await PositionModel.create({ organizationId: a._id, title: "Clerk", code: `P-${unique()}` });
    const project = await ProjectModel.create({ organizationId: a._id, name: "Site", code: `S-${unique()}` });
    await EmployeeAssignmentModel.create({ organizationId: b._id, employeeId: foreign._id, effectiveFrom: new Date("2026-01-01"), status: "active" });

    await expect(
      EmployeeAssignmentService.transfer(foreign._id.toString(), a._id.toString(), { positionId: position._id.toString(), projectId: project._id.toString() }, {}),
    ).rejects.toThrow(NotFoundError);
    await expect(EmployeeAssignmentService.getHistory(foreign._id.toString(), a._id.toString())).rejects.toThrow(NotFoundError);
    // Org B's assignment was left open.
    expect(await EmployeeAssignmentModel.countDocuments({ employeeId: foreign._id, effectiveTo: { $exists: true, $ne: null } })).toBe(0);
  });

  it("won't let a role editor add access they don't hold themselves", async () => {
    await permission("employees.read");
    await permission("roles.update");
    await permission("payroll-runs.read");
    const a = await org();
    const editor = await staffWith(a._id, ["roles.update", "employees.read"]);

    await expect(
      RoleService.update(editor.roleId, a._id.toString(), { name: "Editors", permissionKeys: ["roles.update", "employees.read", "payroll-runs.read"], status: "active" }, { userId: editor.userId }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      RoleService.create({ organizationId: a._id.toString(), name: `New ${unique()}`, permissionKeys: ["payroll-runs.read"], status: "active" }, { userId: editor.userId }),
    ).rejects.toThrow(AuthorizationError);
    // Within their own access it still works.
    await expect(
      RoleService.create({ organizationId: a._id.toString(), name: `Readers ${unique()}`, permissionKeys: ["employees.read"], status: "active" }, { userId: editor.userId }),
    ).resolves.toBeTruthy();
  });

  it("won't let an administrator reset an account that has more access than they do", async () => {
    const a = await org();
    const admin = await staffWith(a._id, ["users.update"]);
    const payrollLead = await staffWith(a._id, ["users.update", "payroll-runs.release"]);
    const peer = await staffWith(a._id, ["users.update"]);

    await expect(AccountSecurityService.resetPassword(payrollLead.userId, a._id.toString(), { userId: admin.userId })).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.resetMfa(payrollLead.userId, a._id.toString(), { userId: admin.userId })).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.resetPassword(peer.userId, a._id.toString(), { userId: admin.userId })).resolves.toMatchObject({ temporaryPassword: expect.any(String) });
  });

  it("counts pending leave against the balance, re-checks it at approval, and refuses self-approval", async () => {
    const a = await org();
    const employee = await employeeIn(a._id);
    const leaveType = await LeaveTypeService.create({ organizationId: a._id.toString(), name: "Vacation", code: `VAC-${unique()}` }, {});
    await LeaveBalanceService.create({ organizationId: a._id.toString(), employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 5 }, {});
    const ask = (start: string, end: string) =>
      LeaveRequestService.create({ organizationId: a._id.toString(), employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), startDate: new Date(start), endDate: new Date(end) }, {});

    const first = await ask("2026-03-02", "2026-03-06");
    // The same 5 days can't be asked for twice while the first request is pending.
    await expect(ask("2026-04-06", "2026-04-10")).rejects.toThrow(BusinessRuleError);

    // The employee's own account can't decide its own request.
    const ownAccount = await UserModel.create({ username: `self.${unique()}`, passwordHash: "x", employeeId: employee._id });
    await expect(LeaveRequestService.decide(first._id.toString(), a._id.toString(), { decision: "approved" }, { userId: ownAccount._id.toString() })).rejects.toThrow(AuthorizationError);

    // Two approvals at once: exactly one wins.
    const results = await Promise.allSettled([
      LeaveRequestService.decide(first._id.toString(), a._id.toString(), { decision: "approved" }, {}),
      LeaveRequestService.decide(first._id.toString(), a._id.toString(), { decision: "approved" }, {}),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason instanceof ConflictError || failure.reason instanceof BusinessRuleError).toBe(true);
  });

  it("answers a malformed id with 400, not a server error", () => {
    const error = Object.assign(new Error("Cast to ObjectId failed"), { name: "CastError" });
    expect(toErrorResponse(error).status).toBe(400);
  });
});
