import { Types } from "mongoose";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateEmployeeAccountInput } from "@/shared/validation/auth";

const SELF_SERVICE_ROLE_NAME = "Employee Self-Service";

/**
 * Grants zero permission-catalog keys on purpose — self-service routes
 * never call authorize()/hasPermission() at all, they gate purely on
 * "does this session's User have an employeeId, and does it match the
 * record being acted on" (see src/app/(self-service)). This role exists
 * only so the account has an active RoleAssignment in the organization,
 * which OrganizationService.listAccessibleTo() requires to resolve
 * "which org does this user belong to" through the same plumbing every
 * other account already uses.
 */
async function findOrCreateSelfServiceRole(organizationId: string) {
  return RoleModel.findOneAndUpdate(
    { organizationId: new Types.ObjectId(organizationId), name: SELF_SERVICE_ROLE_NAME },
    {
      $setOnInsert: {
        organizationId: new Types.ObjectId(organizationId),
        name: SELF_SERVICE_ROLE_NAME,
        description: "Employee self-service access only (attendance clock-in/out) — no HR/admin permissions.",
        permissionKeys: [],
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}

export const EmployeeAccountService = {
  /** Explicit, HR-initiated — never auto-provisioned at hire (see ADR-020). */
  async create(input: CreateEmployeeAccountInput, actor: { userId?: string }) {
    await connectMongoDB();

    const organizationId = new Types.ObjectId(input.organizationId);
    const employee = await EmployeeModel.exists({ _id: new Types.ObjectId(input.employeeId), organizationId });
    if (!employee) throw new NotFoundError("Employee not found in this organization");

    const alreadyLinked = await UserModel.exists({ employeeId: new Types.ObjectId(input.employeeId) });
    if (alreadyLinked) throw new ConflictError("This employee already has a self-service account");

    let user;
    try {
      user = await UserModel.create({
        username: input.username,
        passwordHash: await argon2.hash(input.password),
        employeeId: new Types.ObjectId(input.employeeId),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Username "${input.username}" is already in use`);
      }
      throw error;
    }

    const role = await findOrCreateSelfServiceRole(input.organizationId);
    await RoleAssignmentModel.findOneAndUpdate(
      { userId: user._id, roleId: role._id, organizationId },
      { $setOnInsert: { userId: user._id, roleId: role._id, organizationId, effectiveFrom: new Date() } },
      { upsert: true },
    );

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employee-account.created",
      resourceType: "User",
      resourceId: user._id.toString(),
      after: { username: user.username, employeeId: user.employeeId },
    });

    return user;
  },

  async getForEmployee(employeeId: string) {
    await connectMongoDB();
    return UserModel.findOne({ employeeId: new Types.ObjectId(employeeId) }).select("username status createdAt").lean();
  },
};
