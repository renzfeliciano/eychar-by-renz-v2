import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import {
  EmployeeModel,
  PositionModel,
  OrganizationUnitModel,
  ProjectModel,
  LocationModel,
  EmployeeAssignmentModel,
} from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

export type AssignmentFields = {
  positionId?: string;
  organizationUnitId?: string;
  projectId?: string;
  locationId?: string;
  reportsToEmployeeId?: string;
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
 * pattern as Phase 2's FK checks. `reportsToEmployeeId` gets the same
 * self-reference guard OrganizationUnitService uses for `parentUnitId`.
 */
async function validateAssignmentRefs(organizationId: string, employeeId: string, fields: AssignmentFields) {
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
  if (fields.reportsToEmployeeId) {
    if (fields.reportsToEmployeeId === employeeId) {
      throw new BusinessRuleError("An employee cannot report to themselves");
    }
    checks.push(
      EmployeeModel.exists({ _id: new Types.ObjectId(fields.reportsToEmployeeId), organizationId: orgObjectId }).then(
        (found) => {
          if (!found) throw new NotFoundError("Manager (reportsToEmployeeId) not found in this organization");
        },
      ),
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
    reportsToEmployeeId: input.reportsToEmployeeId ? new Types.ObjectId(input.reportsToEmployeeId) : undefined,
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
      after: { positionId: assignment.positionId, projectId: assignment.projectId, reportsToEmployeeId: assignment.reportsToEmployeeId },
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

    const current = await EmployeeAssignmentModel.findOne({ employeeId: employeeObjectId, ...OPEN_ASSIGNMENT_FILTER });
    const before = current
      ? { positionId: current.positionId, projectId: current.projectId, reportsToEmployeeId: current.reportsToEmployeeId }
      : null;
    if (current) {
      current.effectiveTo = effectiveFrom;
      await current.save();
    }

    const next = await EmployeeAssignmentModel.create(
      toAssignmentDoc({ ...fields, organizationId, employeeId, effectiveFrom }),
    );

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employee-assignment.transferred",
      resourceType: "EmployeeAssignment",
      resourceId: next._id.toString(),
      before,
      after: { positionId: next.positionId, projectId: next.projectId, reportsToEmployeeId: next.reportsToEmployeeId },
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

  async getHistory(employeeId: string) {
    await connectMongoDB();
    return EmployeeAssignmentModel.find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ effectiveFrom: 1 })
      .lean();
  },
};
