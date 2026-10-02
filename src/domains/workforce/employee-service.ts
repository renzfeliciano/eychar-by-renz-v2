import { cache } from "react";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, PersonModel, EmploymentModel, EmployeeAssignmentModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { EmployeeAssignmentService } from "./employee-assignment-service";

export type CreateEmployeeInput = {
  organizationId: string;
  personId: string;
  employeeNumber?: string;
};

/** Picks the most recent row per employeeId from a set sorted by effectiveFrom desc. */
function latestPerEmployee<T extends { employeeId: Types.ObjectId }>(rows: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = row.employeeId.toString();
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}

// Only the fields roster callers read (names, contact details and statutory
// IDs for the roster export, status/type/dates for headcount, payroll and
// contracts, position/project/manager for scoping) — not Person.metadata or
// the timestamps of every history row.
const ROSTER_PERSON_FIELDS = "firstName middleName lastName email phone gender birthDate address sssNumber philHealthNumber pagIbigNumber tinNumber";
const ROSTER_EMPLOYMENT_FIELDS = "employeeId employmentType status effectiveFrom effectiveTo endOfContract";
const ROSTER_ASSIGNMENT_FIELDS = "employeeId positionId organizationUnitId projectId locationId effectiveFrom effectiveTo";

async function loadWithCurrentStatus(organizationId: string) {
  await connectMongoDB();

  const orgObjectId = new Types.ObjectId(organizationId);
  const employees = await EmployeeModel.find({ organizationId: orgObjectId }).lean();
  if (employees.length === 0) return [];

  const employeeIds = employees.map((employee) => employee._id);
  const [persons, employments, assignments] = await Promise.all([
    PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).select(ROSTER_PERSON_FIELDS).lean(),
    EmploymentModel.find({ employeeId: { $in: employeeIds } }).select(ROSTER_EMPLOYMENT_FIELDS).sort({ effectiveFrom: -1 }).lean(),
    EmployeeAssignmentModel.find({ employeeId: { $in: employeeIds } }).select(ROSTER_ASSIGNMENT_FIELDS).sort({ effectiveFrom: -1 }).lean(),
  ]);

  const personById = new Map(persons.map((person) => [person._id.toString(), person]));
  const latestEmploymentByEmployee = latestPerEmployee(employments);
  const latestAssignmentByEmployee = latestPerEmployee(assignments);

  return employees.map((employee) => ({
    ...employee,
    person: personById.get(employee.personId.toString()) ?? null,
    currentEmployment: latestEmploymentByEmployee.get(employee._id.toString()) ?? null,
    currentAssignment: latestAssignmentByEmployee.get(employee._id.toString()) ?? null,
  }));
}

/**
 * Memoized per server render, like `activeGrants` in authorize.ts: a page
 * and the services it calls share one roster read. Outside a render (route
 * handlers, cron, tests) React's cache doesn't memoize, so every call reads
 * fresh. Callers must treat the rows as read-only.
 */
const listWithCurrentStatusOnce = cache(loadWithCurrentStatus);

export const EmployeeService = {
  async create(input: CreateEmployeeInput, actor: { userId?: string }) {
    await connectMongoDB();

    const personExists = await PersonModel.exists({
      _id: new Types.ObjectId(input.personId),
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!personExists) throw new NotFoundError("Person not found in this organization");

    let employee;
    try {
      employee = await EmployeeModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        personId: new Types.ObjectId(input.personId),
        employeeNumber: input.employeeNumber,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Employee number "${input.employeeNumber}" is already in use`);
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employee.created",
      resourceType: "Employee",
      resourceId: employee._id.toString(),
      after: { employeeNumber: employee.employeeNumber, personId: employee.personId },
    });

    return employee;
  },

  async update(employeeId: string, organizationId: string, patch: { employeeNumber?: string }, actor: { userId?: string }) {
    await connectMongoDB();

    // "" clears the number via $unset — employeeNumber has a sparse unique
    // index, so $set-ing it to "" would collide the moment a second
    // employee also cleared theirs, the same way two empty strings would.
    const update = patch.employeeNumber === "" ? { $unset: { employeeNumber: "" } } : { $set: { employeeNumber: patch.employeeNumber } };

    let employee;
    try {
      employee = await EmployeeModel.findOneAndUpdate(
        { _id: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) },
        update,
        { returnDocument: "after" },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError(`Employee number "${patch.employeeNumber}" is already in use`);
      }
      throw error;
    }
    if (!employee) throw new NotFoundError("Employee not found in this organization");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employee.updated",
      resourceType: "Employee",
      resourceId: employee._id.toString(),
      after: { employeeNumber: employee.employeeNumber },
    });

    return employee;
  },

  /**
   * Roster view: each employee joined with their latest Employment and
   * latest EmployeeAssignment. Application-level joins, not an aggregation
   * pipeline — this mirrors the same Map-join style already used on the
   * Positions/Projects pages. Read once per server render (several widgets
   * and services on one page ask for it); see `listWithCurrentStatusOnce`.
   */
  listWithCurrentStatus(organizationId: string) {
    return listWithCurrentStatusOnce(organizationId);
  },

  async getDetail(employeeId: string, organizationId: string) {
    await connectMongoDB();

    const employee = await EmployeeModel.findOne({
      _id: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!employee) throw new NotFoundError("Employee not found in this organization");

    const [person, currentEmployment, currentAssignment, assignmentHistory] = await Promise.all([
      PersonModel.findById(employee.personId).lean(),
      EmploymentModel.findOne({ employeeId: employee._id }).sort({ effectiveFrom: -1 }).lean(),
      EmployeeAssignmentService.getCurrent(employee._id.toString()),
      EmployeeAssignmentService.getHistory(employee._id.toString(), organizationId),
    ]);

    return { employee, person, currentEmployment, currentAssignment, assignmentHistory };
  },
};
