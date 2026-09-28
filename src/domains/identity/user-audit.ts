import { Types } from "mongoose";
import { EmployeeModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";

/**
 * The organization an account's security events belong to in the audit
 * trail: a self-service account's employer, else the organization of the
 * account's first role. Accounts with neither have no trail to write to.
 */
export async function organizationIdForUser(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select("employeeId").lean();
  if (user?.employeeId) {
    const employee = await EmployeeModel.findById(user.employeeId).select("organizationId").lean();
    if (employee) return employee.organizationId.toString();
  }
  const assignment = await RoleAssignmentModel.findOne({ userId: new Types.ObjectId(userId) }).sort({ createdAt: 1 }).select("organizationId").lean();
  return assignment ? assignment.organizationId.toString() : null;
}

/** Records a security event about an account (sign-ins, locks, password and two-factor changes). */
export async function auditUserEvent(userId: string, action: string, metadata: Record<string, unknown> = {}, actorUserId?: string): Promise<void> {
  const organizationId = await organizationIdForUser(userId);
  if (!organizationId) return;
  await AuditService.record({ organizationId, actorUserId: actorUserId ?? userId, action, resourceType: "User", resourceId: userId, metadata });
}
