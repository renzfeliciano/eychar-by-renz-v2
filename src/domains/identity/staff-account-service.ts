import { Types } from "mongoose";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { PersonModel, UserModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError } from "@/shared/errors";
import type { CreateStaffAccountInput } from "@/shared/validation/auth";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";

/**
 * A plain HR/admin-shell login — no `employeeId`, distinct from
 * EmployeeAccountService's self-service account (see ADR-022). Lets HR
 * onboard an additional staff login (e.g. for a Building Administrator
 * role) the same way the seeded HR Administrator account was created,
 * instead of that being a one-time, script-only bootstrap.
 */
export const StaffAccountService = {
  async create(input: CreateStaffAccountInput, actor: { userId?: string }) {
    await connectMongoDB();

    const person = await PersonModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      firstName: input.firstName,
      lastName: input.lastName,
    });

    let user;
    try {
      user = await UserModel.create({
        username: input.username,
        passwordHash: await argon2.hash(input.password),
        // The administrator chose this password, so the person picks their own at first sign-in.
        mustChangePassword: true,
        personId: person._id,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Username "${input.username}" is already in use`);
      }
      throw error;
    }

    if (input.roleId) {
      await RoleAssignmentService.assign({ organizationId: input.organizationId, roleId: input.roleId, userId: user._id.toString() }, actor);
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "staff-account.created",
      resourceType: "User",
      resourceId: user._id.toString(),
      after: { username: user.username, roleId: input.roleId },
    });

    return user;
  },
};
