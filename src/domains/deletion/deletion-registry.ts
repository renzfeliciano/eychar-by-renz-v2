import { Types, type Model } from "mongoose";
import * as models from "@/server/db/models";
import { formatPersonName } from "@/lib/person-name";

/**
 * What each deletable record type takes with it (ADR-033). A plan lists the
 * documents to move to the recycle bin, the changes to records that stay
 * (undone on restore), and blockers that make deletion unsafe. Shared
 * setup (positions, projects, leave types…) is refused while anything uses
 * it; people and their records go together.
 */
export type DeleteStep = { model: Model<any>; filter: Record<string, unknown>; label: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type PatchStep = { model: Model<any>; filter: Record<string, unknown>; op: "pull" | "unset"; field: string; value?: unknown; label: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type DeletionPlan = { label: string; deletes: DeleteStep[]; patches: PatchStep[]; blockers: string[] };

type Planner = (organizationId: Types.ObjectId, id: Types.ObjectId) => Promise<DeletionPlan | null>;

const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** Refuse while other records point at it; otherwise delete just the record. */
function whileUnused(
  model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  recordLabel: string,
  labelOf: (doc: Record<string, unknown>) => string,
  usages: { model: Model<any>; field: string; word: string; many?: string }[], // eslint-disable-line @typescript-eslint/no-explicit-any
): Planner {
  return async (organizationId, id) => {
    const doc = await model.findOne({ _id: id, organizationId }).lean<Record<string, unknown>>();
    if (!doc) return null;
    const blockers: string[] = [];
    for (const usage of usages) {
      const count = await usage.model.countDocuments({ [usage.field]: id });
      if (count) blockers.push(`Used by ${plural(count, usage.word, usage.many)}`);
    }
    return { label: labelOf(doc), deletes: [{ model, filter: { _id: id }, label: recordLabel }], patches: [], blockers };
  };
}

/** A record nothing else depends on. */
function leaf(model: Model<any>, recordLabel: string, labelOf: (doc: Record<string, unknown>) => string): Planner { // eslint-disable-line @typescript-eslint/no-explicit-any
  return whileUnused(model, recordLabel, labelOf, []);
}

async function planEmployee(organizationId: Types.ObjectId, id: Types.ObjectId): Promise<DeletionPlan | null> {
  const employee = await models.EmployeeModel.findOne({ _id: id, organizationId }).lean();
  if (!employee) return null;
  const person = await models.PersonModel.findById(employee.personId).lean();
  const blockers: string[] = [];

  const finishedRuns = await models.PayrollRunModel.find({ organizationId, status: { $in: ["approved", "released"] } }).distinct("_id");
  const paidPayslips = await models.PayrollRecordModel.countDocuments({ employeeId: id, payrollRunId: { $in: finishedRuns } });
  if (paidPayslips) blockers.push(`Has ${plural(paidPayslips, "approved or released payslip")}; payroll history can't be deleted`);
  const paidSettlements = await models.FinalSettlementModel.countDocuments({ employeeId: id, status: "disbursed" });
  if (paidSettlements) blockers.push("Has a paid final settlement; it can't be deleted");

  const users = await models.UserModel.find({ employeeId: id }).distinct("_id");
  const trips = await models.TravelOrderModel.find({ organizationId, employeeIds: id }).select("employeeIds").lean();
  const soloTrips = trips.filter((trip) => trip.employeeIds.length === 1).map((trip) => trip._id);
  const sharedTrips = trips.filter((trip) => trip.employeeIds.length > 1).map((trip) => trip._id);

  const byEmployee = (model: Model<any>, label: string): DeleteStep => ({ model, filter: { employeeId: id }, label }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    label: person ? formatPersonName(person) : (employee.employeeNumber ?? "Employee"),
    blockers,
    deletes: [
      { model: models.EmployeeModel, filter: { _id: id }, label: "Employee record" },
      ...(person ? [{ model: models.PersonModel, filter: { _id: person._id }, label: "Personal details" }] : []),
      byEmployee(models.EmploymentModel, "Employment history"),
      byEmployee(models.EmployeeAssignmentModel, "Job assignments"),
      byEmployee(models.CompensationModel, "Pay terms"),
      byEmployee(models.LeaveBalanceModel, "Leave balances"),
      byEmployee(models.LeaveRequestModel, "Leave requests"),
      byEmployee(models.AttendanceRecordModel, "Attendance records"),
      byEmployee(models.ScheduleEntryModel, "Scheduled days"),
      byEmployee(models.AssetIssuanceModel, "Issued assets"),
      byEmployee(models.EmployeeDocumentModel, "Documents"),
      byEmployee(models.PerformanceReviewModel, "Performance reviews"),
      byEmployee(models.ClearanceCaseModel, "Clearances"),
      byEmployee(models.FinalSettlementModel, "Final settlements"),
      { model: models.PayrollRecordModel, filter: { employeeId: id, payrollRunId: { $nin: finishedRuns } }, label: "Draft payroll lines" },
      { model: models.PayrollAdjustmentModel, filter: { employeeId: id, payrollRunId: { $nin: finishedRuns } }, label: "Draft payroll adjustments" },
      { model: models.UserModel, filter: { _id: { $in: users } }, label: "Login accounts" },
      { model: models.RoleAssignmentModel, filter: { userId: { $in: users } }, label: "Role assignments" },
      { model: models.WebAuthnCredentialModel, filter: { userId: { $in: users } }, label: "Registered biometrics" },
      { model: models.TravelOrderModel, filter: { _id: { $in: soloTrips } }, label: "Travel orders (only them)" },
    ],
    patches: [
      { model: models.TravelOrderModel, filter: { _id: { $in: sharedTrips } }, op: "pull", field: "employeeIds", value: id, label: "Travel orders shared with others (removed from them)" },
      { model: models.EmployeeAssignmentModel, filter: { reportsToEmployeeId: id, employeeId: { $ne: id } }, op: "unset", field: "reportsToEmployeeId", label: "People reporting to them (manager cleared)" },
    ],
  };
}

async function planStaffAccount(organizationId: Types.ObjectId, id: Types.ObjectId): Promise<DeletionPlan | null> {
  const user = await models.UserModel.findById(id).lean();
  if (!user || user.employeeId) return null;
  const person = user.personId ? await models.PersonModel.findOne({ _id: user.personId, organizationId }).lean() : null;
  const inOrganization = person || (await models.RoleAssignmentModel.exists({ organizationId, userId: id }));
  if (!inOrganization) return null;
  const blockers: string[] = [];
  const superRole = await models.RoleModel.findOne({ organizationId, system: "super_admin" }).select("_id").lean();
  if (superRole && (await models.RoleAssignmentModel.exists({ organizationId, roleId: superRole._id, userId: id }))) blockers.push("The Super Administrator's account can't be deleted");
  return {
    label: person ? formatPersonName(person) : (user.username ?? user.email ?? "Account"),
    blockers,
    deletes: [
      { model: models.UserModel, filter: { _id: id }, label: "Login account" },
      { model: models.RoleAssignmentModel, filter: { userId: id }, label: "Role assignments" },
      { model: models.WebAuthnCredentialModel, filter: { userId: id }, label: "Registered biometrics" },
      ...(person ? [{ model: models.PersonModel, filter: { _id: person._id }, label: "Personal details" }] : []),
    ],
    patches: [],
  };
}

async function planClearance(organizationId: Types.ObjectId, id: Types.ObjectId): Promise<DeletionPlan | null> {
  const clearance = await models.ClearanceCaseModel.findOne({ _id: id, organizationId }).lean();
  if (!clearance) return null;
  const paid = await models.FinalSettlementModel.exists({ clearanceCaseId: id, status: "disbursed" });
  return {
    label: clearance.caseNumber,
    blockers: paid ? ["Its final settlement was paid; it can't be deleted"] : [],
    deletes: [
      { model: models.ClearanceCaseModel, filter: { _id: id }, label: "Clearance" },
      { model: models.FinalSettlementModel, filter: { clearanceCaseId: id }, label: "Final settlement" },
    ],
    patches: [],
  };
}

async function planSettlement(organizationId: Types.ObjectId, id: Types.ObjectId): Promise<DeletionPlan | null> {
  const settlement = await models.FinalSettlementModel.findOne({ _id: id, organizationId }).lean();
  if (!settlement) return null;
  const clearance = await models.ClearanceCaseModel.findById(settlement.clearanceCaseId).select("caseNumber").lean();
  return {
    label: `Final settlement ${clearance?.caseNumber ?? ""}`.trim(),
    blockers: settlement.status === "disbursed" ? ["A paid final settlement can't be deleted"] : [],
    deletes: [{ model: models.FinalSettlementModel, filter: { _id: id }, label: "Final settlement" }],
    patches: [],
  };
}

const text = (field: string) => (doc: Record<string, unknown>) => String(doc[field] ?? "");

export const DELETABLE_TYPES = {
  employee: { noun: "employee", plan: planEmployee },
  "staff-account": { noun: "staff account", plan: planStaffAccount },
  clearance: { noun: "clearance", plan: planClearance },
  "final-settlement": { noun: "final settlement", plan: planSettlement },
  position: {
    noun: "position",
    plan: whileUnused(models.PositionModel, "Position", text("title"), [
      { model: models.EmployeeAssignmentModel, field: "positionId", word: "job assignment" },
      { model: models.ApplicantModel, field: "positionId", word: "applicant" },
    ]),
  },
  project: {
    noun: "project",
    plan: whileUnused(models.ProjectModel, "Project", text("name"), [
      { model: models.EmployeeAssignmentModel, field: "projectId", word: "job assignment" },
      { model: models.AttendanceRecordModel, field: "projectId", word: "attendance record" },
      { model: models.ScheduleEntryModel, field: "projectId", word: "scheduled day" },
      { model: models.PayrollRunModel, field: "projectId", word: "payroll run" },
      { model: models.PayrollPolicyModel, field: "projectId", word: "payroll policy", many: "payroll policies" },
      { model: models.LeavePolicyModel, field: "projectId", word: "leave policy", many: "leave policies" },
      { model: models.AttendancePolicyModel, field: "projectId", word: "attendance policy", many: "attendance policies" },
      { model: models.CaseModel, field: "projectId", word: "case" },
    ]),
  },
  location: {
    noun: "location",
    plan: whileUnused(models.LocationModel, "Location", text("name"), [
      { model: models.EmployeeAssignmentModel, field: "locationId", word: "job assignment" },
      { model: models.ProjectModel, field: "locationId", word: "project" },
      { model: models.AttendanceRecordModel, field: "locationId", word: "attendance record" },
    ]),
  },
  "organization-unit": {
    noun: "unit",
    plan: whileUnused(models.OrganizationUnitModel, "Unit", text("name"), [
      { model: models.EmployeeAssignmentModel, field: "organizationUnitId", word: "job assignment" },
      { model: models.OrganizationUnitModel, field: "parentUnitId", word: "sub-unit" },
    ]),
  },
  "leave-type": {
    noun: "leave type",
    plan: whileUnused(models.LeaveTypeModel, "Leave type", text("name"), [
      { model: models.LeaveBalanceModel, field: "leaveTypeId", word: "leave balance" },
      { model: models.LeaveRequestModel, field: "leaveTypeId", word: "leave request" },
      { model: models.LeavePolicyModel, field: "leaveTypeId", word: "leave policy", many: "leave policies" },
    ]),
  },
  "shift-template": {
    noun: "shift",
    plan: whileUnused(models.ShiftTemplateModel, "Shift", text("name"), [{ model: models.ScheduleEntryModel, field: "shiftTemplateId", word: "scheduled day" }]),
  },
  "travel-order": { noun: "travel order", plan: leaf(models.TravelOrderModel, "Travel order", (doc) => `Travel order ${new Date(doc.startDate as Date).toISOString().slice(0, 10)}`) },
  case: { noun: "case", plan: leaf(models.CaseModel, "Case", text("caseName")) },
  event: { noun: "event", plan: leaf(models.EventModel, "Event", text("title")) },
  applicant: { noun: "applicant", plan: leaf(models.ApplicantModel, "Applicant", text("applicantName")) },
  "asset-issuance": { noun: "asset record", plan: leaf(models.AssetIssuanceModel, "Asset record", text("assetName")) },
  "employee-document": { noun: "document", plan: leaf(models.EmployeeDocumentModel, "Document", text("title")) },
} as const;

export type DeletableType = keyof typeof DELETABLE_TYPES;

export function isDeletableType(value: string): value is DeletableType {
  return value in DELETABLE_TYPES;
}
