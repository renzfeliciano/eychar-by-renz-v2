import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ClearanceCaseModel, ClearanceChecklistItemModel, EmployeeModel, PersonModel, UserModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate } from "@/lib/date-key";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { ClearanceItemActionInput, OpenClearanceInput } from "@/shared/validation/clearance";
import { deriveCaseStatus } from "./clearance-summary";

const DAY_MS = 86_400_000;
const ACTION_STATUS = { clear: "cleared", flag: "flagged", waive: "waived", not_applicable: "not_applicable", reopen: "pending" } as const;

async function requireCase(id: string, organizationId: string) {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Clearance not found in this organization");
  const clearance = await ClearanceCaseModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
  if (!clearance) throw new NotFoundError("Clearance not found in this organization");
  return clearance;
}

/** Nobody signs off their own clearance: the actor's account must not be the departing employee's. */
async function assertNotSelf(actorUserId: string | undefined, employeeId: Types.ObjectId) {
  if (!actorUserId || !Types.ObjectId.isValid(actorUserId)) return;
  const [user, employee] = await Promise.all([
    UserModel.findById(actorUserId).select("employeeId personId").lean(),
    EmployeeModel.findById(employeeId).select("personId").lean(),
  ]);
  if (!user || !employee) return;
  const isSelf = user.employeeId?.toString() === employeeId.toString() || (user.personId && user.personId.toString() === employee.personId.toString());
  if (isSelf) throw new AuthorizationError("You can't sign off your own clearance");
}

async function nextCaseNumber(organizationId: Types.ObjectId, year: number): Promise<string> {
  const prefix = `CLR-${year}-`;
  const last = await ClearanceCaseModel.findOne({ organizationId, caseNumber: { $regex: `^${prefix}` } }).sort({ caseNumber: -1 }).select("caseNumber").lean();
  const next = last ? Number(String(last.caseNumber).slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Workforce clearance (ADR-031): one case per separation, with the
 * organization's checklist copied in. Each department resolves its own
 * items; the case is "cleared" once every blocking item is resolved, which
 * is what lets final settlement (ADR-032) go to approval.
 */
export const ClearanceService = {
  async open(input: OpenClearanceInput, actor: { userId?: string }) {
    await connectMongoDB();
    const organizationId = new Types.ObjectId(input.organizationId);

    const employee = Types.ObjectId.isValid(input.employeeId) ? await EmployeeModel.findOne({ _id: new Types.ObjectId(input.employeeId), organizationId }).lean() : null;
    if (!employee) throw new NotFoundError("Employee not found in this organization");
    await SeparationTypeService.assertValidCode(input.organizationId, input.separationTypeCode);
    if (input.lastWorkingDay < input.noticeDate) throw new BusinessRuleError("The last working day can't be before the notice date");
    if (await ClearanceCaseModel.exists({ organizationId, employeeId: employee._id, active: true })) {
      throw new ConflictError("This employee already has a clearance in progress");
    }

    const [checklist, departments] = await Promise.all([
      ClearanceChecklistItemModel.find({ organizationId, status: "active" }).lean(),
      ClearanceDepartmentService.listCurrent(input.organizationId),
    ]);
    const departmentOrder = new Map(departments.map((department, index) => [department.code, { name: department.name, order: department.sortOrder ?? index }]));
    const lastWorkingDay = dateKeyToDate(input.lastWorkingDay);
    const items = checklist
      .filter((item) => departmentOrder.has(item.departmentCode))
      .sort((a, b) => departmentOrder.get(a.departmentCode)!.order - departmentOrder.get(b.departmentCode)!.order || a.sortOrder - b.sortOrder)
      .map((item) => ({
        checklistItemId: item._id,
        departmentCode: item.departmentCode,
        departmentName: departmentOrder.get(item.departmentCode)!.name,
        title: item.title,
        description: item.description,
        blocking: item.blocking,
        dueDate: new Date(lastWorkingDay.getTime() + item.dueDaysAfterLastDay * DAY_MS),
        status: "pending",
      }));

    let clearance;
    for (let attempt = 0; ; attempt++) {
      try {
        clearance = await ClearanceCaseModel.create({
          organizationId,
          caseNumber: await nextCaseNumber(organizationId, new Date().getFullYear()),
          employeeId: employee._id,
          separationTypeCode: input.separationTypeCode,
          noticeDate: dateKeyToDate(input.noticeDate),
          lastWorkingDay,
          noticeReference: input.noticeReference,
          remarks: input.remarks,
          status: deriveCaseStatus(items),
          items,
          openedBy: actor.userId && Types.ObjectId.isValid(actor.userId) ? new Types.ObjectId(actor.userId) : undefined,
        });
        break;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        // Two cases opened at once for the same employee, or a case number race: retry the number once.
        if (await ClearanceCaseModel.exists({ organizationId, employeeId: employee._id, active: true })) throw new ConflictError("This employee already has a clearance in progress");
        if (attempt >= 2) throw error;
      }
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "clearance.opened",
      resourceType: "ClearanceCase",
      resourceId: clearance._id.toString(),
      after: { caseNumber: clearance.caseNumber, employeeId: input.employeeId, separationType: input.separationTypeCode, lastWorkingDay: input.lastWorkingDay, items: items.length },
    });
    return clearance;
  },

  async getById(id: string, organizationId: string) {
    return requireCase(id, organizationId);
  },

  /** Every case, newest first, with the employee's name and the separation type's name resolved. */
  async listForOrganization(organizationId: string) {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const [cases, separationTypes] = await Promise.all([
      ClearanceCaseModel.find({ organizationId: orgObjectId }).sort({ createdAt: -1 }).lean(),
      SeparationTypeService.listCurrent(organizationId),
    ]);
    const employees = await EmployeeModel.find({ _id: { $in: cases.map((clearance) => clearance.employeeId) } }).select("personId employeeNumber").lean();
    const persons = await PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).lean();
    const personById = new Map(persons.map((person) => [person._id.toString(), person]));
    const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));
    const typeNameByCode = new Map(separationTypes.map((type) => [type.code, type.name]));

    return cases.map((clearance) => {
      const employee = employeeById.get(clearance.employeeId.toString());
      const person = employee ? personById.get(employee.personId.toString()) : undefined;
      return {
        ...clearance,
        employeeName: person ? formatPersonName(person) : "Unknown employee",
        employeeNumber: employee?.employeeNumber ?? "",
        separationTypeName: typeNameByCode.get(clearance.separationTypeCode) ?? clearance.separationTypeCode,
      };
    });
  },

  async actOnItem(caseId: string, organizationId: string, itemId: string, input: ClearanceItemActionInput, actor: { userId?: string }) {
    const clearance = await requireCase(caseId, organizationId);
    if (clearance.status === "cancelled" || clearance.status === "closed") throw new BusinessRuleError(`This clearance is ${clearance.status} and can't be changed`);
    await assertNotSelf(actor.userId, clearance.employeeId);

    const item = clearance.items.id(itemId);
    if (!item) throw new NotFoundError("Checklist item not found on this clearance");
    const note = input.note?.trim();
    if ((input.action === "flag" || input.action === "waive" || input.action === "reopen") && !note) {
      throw new BusinessRuleError(input.action === "flag" ? "Describe the issue when flagging an item" : `Give a reason to ${input.action === "waive" ? "waive" : "reopen"} this item`);
    }

    const before = { status: item.status, amount: item.amount, note: item.note };
    item.status = ACTION_STATUS[input.action];
    item.note = note || undefined;
    item.amount = input.action === "flag" ? (input.amount ?? 0) : undefined;
    item.actedBy = input.action === "reopen" || !actor.userId || !Types.ObjectId.isValid(actor.userId) ? undefined : new Types.ObjectId(actor.userId);
    item.actedAt = input.action === "reopen" ? undefined : new Date();
    clearance.status = deriveCaseStatus(clearance.items);
    await clearance.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "clearance.item-updated",
      resourceType: "ClearanceCase",
      resourceId: clearance._id.toString(),
      before,
      after: { status: item.status, amount: item.amount, note: item.note },
      metadata: { itemId, department: item.departmentName, title: item.title, action: input.action },
    });
    return clearance;
  },

  /** Withdrawn resignation, entered in error, etc. Items freeze; a new case can be opened later. */
  async cancel(caseId: string, organizationId: string, input: { reason: string }, actor: { userId?: string }) {
    const clearance = await requireCase(caseId, organizationId);
    if (!input.reason.trim()) throw new BusinessRuleError("Give a reason for cancelling this clearance");
    if (clearance.status === "cancelled" || clearance.status === "closed") throw new BusinessRuleError(`This clearance is already ${clearance.status}`);

    const before = { status: clearance.status };
    clearance.status = "cancelled";
    clearance.active = false;
    clearance.cancelReason = input.reason.trim();
    await clearance.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "clearance.cancelled",
      resourceType: "ClearanceCase",
      resourceId: clearance._id.toString(),
      before,
      after: { status: "cancelled", reason: clearance.cancelReason },
    });
    return clearance;
  },
};
