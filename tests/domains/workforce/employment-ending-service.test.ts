import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, AuditLogModel, ClearanceCaseModel, EmployeeModel, EmploymentModel, FinalSettlementModel, OrganizationModel, PayrollRecordModel, PersonModel } from "@/server/db/models";
import { FINAL_SETTLEMENT_STATUSES } from "@/server/db/models/final-settlement";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { localDateKey } from "@/lib/date-key";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DAY = 86_400_000;

/** An organization with the status catalog, one employee, and an employment ended as Terminated. */
async function endedEmployee(options: { hiredOn?: Date; end?: boolean } = {}) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-end-${unique()}` });
  const organizationId = organization._id.toString();
  for (const [code, name, active] of [["active", "Active", true], ["on_leave", "On Leave", true], ["terminated", "Terminated", false], ["resigned", "Resigned", false]] as const) {
    await EmploymentStatusService.create({ organizationId, code, name, metadata: { isActiveHeadcount: active } }, {});
  }
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `E-${unique()}` });
  const employeeId = employee._id.toString();
  const hiredOn = options.hiredOn ?? new Date(Date.now() - 60 * DAY);
  const employment = await EmploymentService.create({ organizationId, employeeId, employmentType: "regular", effectiveFrom: hiredOn }, {});
  if (options.end !== false) {
    await EmploymentService.terminate(employment._id.toString(), organizationId, { status: "terminated", terminationReason: "Recorded as terminated" }, {});
  }
  return { organizationId, employeeId, employmentId: employment._id.toString(), hiredOn };
}

async function settlementFor(organizationId: string, employeeId: string, status: (typeof FINAL_SETTLEMENT_STATUSES)[number], createdAt?: Date) {
  const settlement = await FinalSettlementModel.create({
    organizationId: new Types.ObjectId(organizationId),
    clearanceCaseId: new Types.ObjectId(),
    employeeId: new Types.ObjectId(employeeId),
    status,
  });
  if (createdAt) await FinalSettlementModel.collection.updateOne({ _id: settlement._id }, { $set: { createdAt } });
  return settlement;
}

describe("ending history and Edit ending", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("terminate now records an \"ended\" entry in endingHistory", async () => {
    const { employmentId } = await endedEmployee();
    const employment = await EmploymentModel.findById(employmentId).lean();
    expect(employment?.endingHistory).toHaveLength(1);
    expect(employment?.endingHistory?.[0]).toMatchObject({ action: "ended", status: "terminated", reason: "Recorded as terminated" });
  });

  it("corrects Terminated to Resigned in one step, never active", async () => {
    const { organizationId, employeeId, employmentId } = await endedEmployee();
    const before = await EmploymentModel.findById(employmentId).lean();

    const corrected = await EmploymentService.correctEnding(employeeId, organizationId, { status: "resigned", terminationReason: "Resignation letter 3 Nov" }, { userId: undefined });

    expect(corrected.status).toBe("resigned");
    expect(corrected.terminationReason).toBe("Resignation letter 3 Nov");
    expect(corrected.effectiveTo?.getTime()).toBe(before?.effectiveTo?.getTime());
    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored?.endingHistory?.map((entry: { action: string }) => entry.action)).toEqual(["ended", "ending_corrected"]);
    const audit = await AuditLogModel.findOne({ resourceId: employmentId, action: "employment.ending_corrected" }).lean();
    expect(audit?.before).toMatchObject({ status: "terminated" });
    expect(audit?.after).toMatchObject({ status: "resigned" });
  });

  it("allows a last day equal to today and equal to the hire date", async () => {
    const hiredOn = new Date(`${localDateKey(new Date(Date.now() - 30 * DAY))}T00:00:00Z`);
    const { organizationId, employeeId } = await endedEmployee({ hiredOn });

    // Hire date first, then today: each differs from the stored end day whatever the time of day.
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: hiredOn }, {})).resolves.toBeDefined();
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: new Date(`${localDateKey()}T00:00:00Z`) }, {})).resolves.toBeDefined();
  });

  it("refuses a future last day, one before the hire date, and a reason flagged active headcount", async () => {
    const { organizationId, employeeId, employmentId } = await endedEmployee();
    const before = await EmploymentModel.findById(employmentId).lean();

    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: new Date(Date.now() + 3 * DAY) }, {})).rejects.toThrow(/future/);
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: new Date(Date.now() - 90 * DAY) }, {})).rejects.toThrow(/before/);
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "on_leave" }, {})).rejects.toThrow(BusinessRuleError);

    const after = await EmploymentModel.findById(employmentId).lean();
    expect(after?.status).toBe("terminated");
    expect(after?.effectiveTo?.getTime()).toBe(before?.effectiveTo?.getTime());
    expect(after?.endingHistory).toHaveLength(1);
  });

  it("refuses when nothing changed", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "terminated" }, {})).rejects.toThrow(/Nothing changed/);
  });

  it("refuses an employment that has not ended", async () => {
    const { organizationId, employeeId } = await endedEmployee({ end: false });
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "resigned" }, {})).rejects.toThrow(/hasn.t ended/);
  });

  it("reads another organization's employee as not found", async () => {
    const { employeeId } = await endedEmployee();
    const other = await endedEmployee();
    await expect(EmploymentService.correctEnding(employeeId, other.organizationId, { status: "resigned" }, {})).rejects.toThrow(NotFoundError);
  });

  it("refuses a last-day change once a final settlement that is not cancelled exists, but still lets the reason change", async () => {
    const { organizationId, employeeId, employmentId } = await endedEmployee();
    const settlement = await settlementFor(organizationId, employeeId, "draft");
    const earlier = new Date(Date.now() - 20 * DAY);

    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: earlier }, {})).rejects.toThrow(/final settlement/i);
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "resigned" }, {})).resolves.toBeDefined();

    await FinalSettlementModel.updateOne({ _id: settlement._id }, { $set: { status: "cancelled" } });
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: earlier }, {})).resolves.toBeDefined();
    expect((await EmploymentModel.findById(employmentId).lean())?.effectiveTo?.getTime()).toBe(earlier.getTime());
  });

  it("ignores a settlement from an earlier stint when deciding whether the last day is locked", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    await settlementFor(organizationId, employeeId, "disbursed", new Date(Date.now() - 400 * DAY));
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { effectiveTo: new Date(Date.now() - 20 * DAY) }, {})).resolves.toBeDefined();
  });
});

describe("Edit ending when the current reason was later retired", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("still saves a note or last-day change that re-sends the unchanged, now-retired reason", async () => {
    const { organizationId, employeeId, employmentId } = await endedEmployee();
    const terminated = await EmploymentStatusService.getByCode(organizationId, "terminated");
    await EmploymentStatusService.updateStatus(terminated!._id.toString(), organizationId, { status: "inactive" }, {});

    // The Edit ending dialog always sends the reason it opened with.
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "terminated", terminationReason: "Clarified the circumstances" }, {})).resolves.toBeDefined();
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "terminated", effectiveTo: new Date(Date.now() - 20 * DAY) }, {})).resolves.toBeDefined();

    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored?.status).toBe("terminated");
    expect(stored?.terminationReason).toBe("Clarified the circumstances");
    // Choosing a different retired reason is still refused.
    const resigned = await EmploymentStatusService.getByCode(organizationId, "resigned");
    await EmploymentStatusService.updateStatus(resigned!._id.toString(), organizationId, { status: "inactive" }, {});
    await expect(EmploymentService.correctEnding(employeeId, organizationId, { status: "resigned" }, {})).rejects.toThrow(BusinessRuleError);
  });
});

describe("Reinstate", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("reinstates the same employment: active, no end date, same hire date, history and audit", async () => {
    const { organizationId, employeeId, employmentId, hiredOn } = await endedEmployee();

    const reinstated = await EmploymentService.reinstate(employeeId, organizationId, { reason: "Termination was recorded in error" }, {});

    expect(reinstated.status).toBe("active");
    expect(reinstated.effectiveTo).toBeUndefined();
    expect(reinstated.terminationReason).toBeUndefined();
    expect(reinstated.effectiveFrom.getTime()).toBe(hiredOn.getTime());
    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored?.endingHistory?.map((entry: { action: string }) => entry.action)).toEqual(["ended", "reinstated"]);
    expect(stored?.endingHistory?.[1].reason).toBe("Termination was recorded in error");
    const audit = await AuditLogModel.findOne({ resourceId: employmentId, action: "employment.reinstated" }).lean();
    expect(audit?.before).toMatchObject({ status: "terminated" });
    expect(audit?.after).toMatchObject({ status: "active" });
    expect((await EmploymentService.getCurrent(employeeId))?._id.toString()).toBe(employmentId);
  });

  it("requires a reason", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "" }, {})).rejects.toThrow(/why/i);
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "   " }, {})).rejects.toThrow(/why/i);
    expect(await EmploymentService.getCurrent(employeeId)).toBeNull();
  });

  it("refuses when not ended, and a second reinstate right after the first (the race)", async () => {
    const open = await endedEmployee({ end: false });
    await expect(EmploymentService.reinstate(open.employeeId, open.organizationId, { reason: "Because" }, {})).rejects.toThrow(/hasn.t ended/);

    const { organizationId, employeeId, employmentId } = await endedEmployee();
    await EmploymentService.reinstate(employeeId, organizationId, { reason: "First" }, {});
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "Second" }, {})).rejects.toThrow(/hasn.t ended/);
    const stored = await EmploymentModel.findById(employmentId).lean();
    expect(stored?.endingHistory?.filter((entry: { action: string }) => entry.action === "reinstated")).toHaveLength(1);
  });

  it("refuses when final pay was disbursed", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    await settlementFor(organizationId, employeeId, "disbursed");
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "Because" }, {})).rejects.toThrow(/paid out/);
    expect(await EmploymentService.getCurrent(employeeId)).toBeNull();
  });

  it("ignores a disbursed settlement from an earlier stint", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    await settlementFor(organizationId, employeeId, "disbursed", new Date(Date.now() - 400 * DAY));
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "Returned in error" }, {})).resolves.toBeDefined();
  });

  it("refuses while a clearance case is open, and allows it once the case is cancelled", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    const clearance = await ClearanceCaseModel.create({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: new Types.ObjectId(employeeId),
      caseNumber: `CLR-${unique()}`,
      separationTypeCode: "resignation",
      noticeDate: new Date(),
      lastWorkingDay: new Date(),
      active: true,
    });
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "Because" }, {})).rejects.toThrow(/clearance/i);

    await ClearanceCaseModel.updateOne({ _id: clearance._id }, { $set: { active: false, status: "cancelled" } });
    await expect(EmploymentService.reinstate(employeeId, organizationId, { reason: "Because" }, {})).resolves.toBeDefined();
  });

  it("reads another organization's employee as not found", async () => {
    const { employeeId } = await endedEmployee();
    const other = await endedEmployee();
    await expect(EmploymentService.reinstate(employeeId, other.organizationId, { reason: "Because" }, {})).rejects.toThrow(NotFoundError);
  });

  it("leaves attendance and payroll records untouched", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    const orgId = new Types.ObjectId(organizationId);
    const empId = new Types.ObjectId(employeeId);
    const stamp = new Date("2026-11-01T00:00:00Z");
    await AttendanceRecordModel.collection.insertOne({ organizationId: orgId, employeeId: empId, date: stamp, marker: "attendance", updatedAt: stamp });
    await PayrollRecordModel.collection.insertOne({ organizationId: orgId, employeeId: empId, marker: "payroll", updatedAt: stamp });

    await EmploymentService.reinstate(employeeId, organizationId, { reason: "Returned in error" }, {});

    expect(await AttendanceRecordModel.collection.findOne({ employeeId: empId })).toMatchObject({ marker: "attendance", updatedAt: stamp });
    expect(await PayrollRecordModel.collection.findOne({ employeeId: empId })).toMatchObject({ marker: "payroll", updatedAt: stamp });
  });
});

describe("getEndingState", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("says an open employment has not ended", async () => {
    const { organizationId, employeeId } = await endedEmployee({ end: false });
    expect(await EmploymentService.getEndingState(employeeId, organizationId)).toEqual({ ended: false, reinstateBlockedReason: null, lastDayLockedReason: null });
  });

  it("is free for an ended employment with nothing in the way", async () => {
    const { organizationId, employeeId } = await endedEmployee();
    expect(await EmploymentService.getEndingState(employeeId, organizationId)).toEqual({ ended: true, reinstateBlockedReason: null, lastDayLockedReason: null });
  });

  it("gives the reasons the actions give: a disbursed settlement blocks reinstating, a draft only locks the last day", async () => {
    const draft = await endedEmployee();
    await settlementFor(draft.organizationId, draft.employeeId, "draft");
    const draftState = await EmploymentService.getEndingState(draft.employeeId, draft.organizationId);
    expect(draftState.reinstateBlockedReason).toBeNull();
    expect(draftState.lastDayLockedReason).toMatch(/final settlement/i);

    const paid = await endedEmployee();
    await settlementFor(paid.organizationId, paid.employeeId, "disbursed");
    const paidState = await EmploymentService.getEndingState(paid.employeeId, paid.organizationId);
    expect(paidState.reinstateBlockedReason).toMatch(/paid out/);
    expect(paidState.lastDayLockedReason).toMatch(/final settlement/i);
  });

  it("reads another organization's employee as not found", async () => {
    const { employeeId } = await endedEmployee();
    const other = await endedEmployee();
    await expect(EmploymentService.getEndingState(employeeId, other.organizationId)).rejects.toThrow(NotFoundError);
  });
});
