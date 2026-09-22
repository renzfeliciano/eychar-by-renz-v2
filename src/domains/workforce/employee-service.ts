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
   * pipeline — roster size is small at this phase, and this mirrors the
   * same Map-join style already used on the Positions/Projects pages.
   */
  async listWithCurrentStatus(organizationId: string) {
    await connectMongoDB();

    const orgObjectId = new Types.ObjectId(organizationId);
    const employees = await EmployeeModel.find({ organizationId: orgObjectId }).lean();
    if (employees.length === 0) return [];

    const employeeIds = employees.map((employee) => employee._id);
    const [persons, employments, assignments] = await Promise.all([
      PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).lean(),
      EmploymentModel.find({ employeeId: { $in: employeeIds } }).sort({ effectiveFrom: -1 }).lean(),
      EmployeeAssignmentModel.find({ employeeId: { $in: employeeIds } }).sort({ effectiveFrom: -1 }).lean(),
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
      EmployeeAssignmentService.getHistory(employee._id.toString()),
    ]);

    return { employee, person, currentEmployment, currentAssignment, assignmentHistory };
  },
};
