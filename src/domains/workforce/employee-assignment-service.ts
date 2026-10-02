import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { withTransaction } from "@/server/db/transaction";
import {
  EmployeeModel,
  PositionModel,
  OrganizationUnitModel,
  ProjectModel,
  LocationModel,
  EmployeeAssignmentModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { assertInOrganization } from "@/server/db/assert-in-organization";

export type AssignmentFields = {
  positionId?: string;
  organizationUnitId?: string;
  projectId?: string;
  locationId?: string;
  effectiveFrom?: Date;
};

export type CreateAssignmentInput = AssignmentFields & {
  organizationId: string;
  employeeId: string;
};

const OPEN_ASSIGNMENT_FILTER = {
  $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }],
};

/**
 * Every referenced position/unit/project/location must belong to the same
 * organization (never trust a client-supplied id, AGENTS.md §36) — same
 * pattern as Phase 2's FK checks. Who sits under whom lives on the org
 * chart (ADR-046), not on assignments.
 */
async function validateAssignmentRefs(organizationId: string, employeeId: string, fields: AssignmentFields) {
  // The employee being assigned must itself belong to this organization.
  await assertInOrganization(EmployeeModel, employeeId, organizationId, "Employee");
  const orgObjectId = new Types.ObjectId(organizationId);

  const checks: Promise<void>[] = [];
  if (fields.positionId) {
    checks.push(
      PositionModel.exists({ _id: new Types.ObjectId(fields.positionId), organizationId: orgObjectId }).then((found) => {
        if (!found) throw new NotFoundError("Position not found in this organization");
      }),
    );
  }
  if (fields.organizationUnitId) {
    checks.push(
      OrganizationUnitModel.exists({ _id: new Types.ObjectId(fields.organizationUnitId), organizationId: orgObjectId }).then(
        (found) => {
          if (!found) throw new NotFoundError("Organization unit not found in this organization");
        },
      ),
    );
  }
  if (fields.projectId) {
    checks.push(
      ProjectModel.exists({ _id: new Types.ObjectId(fields.projectId), organizationId: orgObjectId }).then((found) => {
        if (!found) throw new NotFoundError("Project not found in this organization");
      }),
    );
  }
  if (fields.locationId) {
    checks.push(
      LocationModel.exists({ _id: new Types.ObjectId(fields.locationId), organizationId: orgObjectId }).then((found) => {
        if (!found) throw new NotFoundError("Location not found in this organization");
      }),
    );
  }

  await Promise.all(checks);
}

function toAssignmentDoc(input: CreateAssignmentInput) {
  return {
    organizationId: new Types.ObjectId(input.organizationId),
    employeeId: new Types.ObjectId(input.employeeId),
    positionId: input.positionId ? new Types.ObjectId(input.positionId) : undefined,
    organizationUnitId: input.organizationUnitId ? new Types.ObjectId(input.organizationUnitId) : undefined,
    projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
    locationId: input.locationId ? new Types.ObjectId(input.locationId) : undefined,
    effectiveFrom: input.effectiveFrom ?? new Date(),
  };
}

export const EmployeeAssignmentService = {
  /** First assignment only — there is no prior one to close (see `transfer` for moves). */
  async create(input: CreateAssignmentInput, actor: { userId?: string }) {
    await connectMongoDB();
    await validateAssignmentRefs(input.organizationId, input.employeeId, input);

    const assignment = await EmployeeAssignmentModel.create(toAssignmentDoc(input));

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employee-assignment.created",
      resourceType: "EmployeeAssignment",
      resourceId: assignment._id.toString(),
      after: { positionId: assignment.positionId, projectId: assignment.projectId },
    });

    return assignment;
  },

  /**
   * The transfer mechanic (AGENTS.md §15/§16/§59): the employee's current
   * assignment is closed (effectiveTo set), never edited in place, and a
   * new assignment row is created — both remain queryable afterwards.
   */
  async transfer(employeeId: string, organizationId: string, fields: AssignmentFields, actor: { userId?: string }) {
    await connectMongoDB();
    await validateAssignmentRefs(organizationId, employeeId, fields);

    const employeeObjectId = new Types.ObjectId(employeeId);
    const effectiveFrom = fields.effectiveFrom ?? new Date();

    const current = await EmployeeAssignmentModel.findOne({ employeeId: employeeObjectId, organizationId: new Types.ObjectId(organizationId), ...OPEN_ASSIGNMENT_FILTER });

    // Anything the caller didn't specify carries over from the assignment
    // being closed out — a transfer changes what it says it changes; it
    // must never silently blank out everything else (AGENTS.md §15/§16).
    const merged: AssignmentFields = {
      positionId: fields.positionId ?? current?.positionId?.toString(),
      organizationUnitId: fields.organizationUnitId ?? current?.organizationUnitId?.toString(),
      projectId: fields.projectId ?? current?.projectId?.toString(),
      locationId: fields.locationId ?? current?.locationId?.toString(),
      effectiveFrom,
    };

    // Position and project are required on every assignment. Checked before
    // touching `current` so a rejected transfer never leaves the employee
    // mid-move with no open assignment.
    if (!merged.positionId || !merged.projectId) {
      throw new BusinessRuleError("Position and project are required to complete a transfer");
    }

    const before = current
      ? { positionId: current.positionId, projectId: current.projectId }
      : null;
    // Closing the old assignment and opening the new one is one change
    // (ADR-041): the employee is never left with no open assignment, or two.
    // `current` was read outside the transaction, so it's closed only if it
    // is still open: a transfer that raced this one (two HR tabs, a double
    // submit) and closed it first makes this one fail instead of opening a
    // second assignment on top of the other's. Concurrent transactions on
    // the same row also hit a write conflict; the retry then lands here.
    const next = await withTransaction(async (session) => {
      if (current) {
        const closed = await EmployeeAssignmentModel.findOneAndUpdate(
          { _id: current._id, organizationId: new Types.ObjectId(organizationId), ...OPEN_ASSIGNMENT_FILTER },
          { $set: { effectiveTo: effectiveFrom } },
          { session, new: true },
        );
        if (!closed) throw new ConflictError("This employee's assignment was just changed by someone else. Reload and try again.");
      } else if (await EmployeeAssignmentModel.exists({ employeeId: employeeObjectId, organizationId: new Types.ObjectId(organizationId), ...OPEN_ASSIGNMENT_FILTER }).session(session)) {
        throw new ConflictError("This employee's assignment was just changed by someone else. Reload and try again.");
      }
      const [created] = await EmployeeAssignmentModel.create([toAssignmentDoc({ ...merged, organizationId, employeeId })], { session });
      return created;
    });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employee-assignment.transferred",
      resourceType: "EmployeeAssignment",
      resourceId: next._id.toString(),
      before,
      after: { positionId: next.positionId, projectId: next.projectId },
    });

    return next;
  },

  async getCurrent(employeeId: string) {
    await connectMongoDB();
    return EmployeeAssignmentModel.findOne({ employeeId: new Types.ObjectId(employeeId), ...OPEN_ASSIGNMENT_FILTER })
      .sort({ effectiveFrom: -1 })
      .lean();
  },

  async getAsOf(employeeId: string, date: Date) {
    await connectMongoDB();
    return EmployeeAssignmentModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      effectiveFrom: { $lte: date },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: date } }],
    }).lean();
  },

  /** The employee's assignments in `organizationId`, oldest first. */
  async getHistory(employeeId: string, organizationId: string) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, employeeId, organizationId, "Employee");
    return EmployeeAssignmentModel.find({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) })
      .sort({ effectiveFrom: 1 })
      .lean();
  },
};
