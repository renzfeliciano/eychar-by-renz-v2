import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, ClearanceCaseModel, LeaveBalanceModel, LeaveTypeModel, PayrollPolicyModel, UserModel } from "@/server/db/models";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { PaymentMethodService } from "@/domains/catalog/payment-method-service";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { AuthorizationError, BusinessRuleError, ConflictError, ValidationError } from "@/shared/errors";
import { seedPayrollOrganization, seedEmployee } from "../payroll/fixtures";

async function seed() {
  const { organizationId } = await seedPayrollOrganization();
  const employeeId = await seedEmployee(organizationId, "Ana", { compensation: { rateType: "monthly", rate: 26_100 } });
  await ClearanceDepartmentService.create({ organizationId, code: "it", name: "IT" }, {});
  await SeparationTypeService.create({ organizationId, code: "resignation", name: "Resignation" }, {});
  await PaymentMethodService.create({ organizationId, code: "bank_transfer", name: "Bank transfer" }, {});
  await ClearanceChecklistService.create({ organizationId, departmentCode: "it", title: "Return laptop", blocking: true, dueDaysAfterLastDay: 0 }, {});
  const vacation = await LeaveTypeModel.create({ organizationId, name: "Vacation Leave", code: "VL", convertibleAtSeparation: true });
  const sick = await LeaveTypeModel.create({ organizationId, name: "Sick Leave", code: "SL" });
  await LeaveBalanceModel.create({ organizationId, employeeId, leaveTypeId: vacation._id, year: 2026, entitledDays: 5 });
  await LeaveBalanceModel.create({ organizationId, employeeId, leaveTypeId: sick._id, year: 2026, entitledDays: 10 });

  const clearance = await ClearanceService.open(
    { organizationId, employeeId, separationTypeCode: "resignation", noticeDate: "2026-09-16", lastWorkingDay: "2026-10-02", noticeReference: "Email" },
    {},
  );
  const laptopId = clearance.items[0]._id.toString();
  const users = await Promise.all(["prep", "hr", "fin"].map((name) => UserModel.create({ username: `${name}.${Date.now()}.${Math.random()}`, passwordHash: "x" })));
  const [preparer, reviewer, approver] = users.map((user) => user._id.toString());
  return { organizationId, employeeId, caseId: clearance._id.toString(), laptopId, preparer, reviewer, approver };
}

describe("FinalSettlementService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("prepares a settlement from live records: salary balance, convertible leave, 13th month and clearance accountabilities", async () => {
    const s = await seed();
    await ClearanceService.actOnItem(s.caseId, s.organizationId, s.laptopId, { action: "flag", amount: 8500, note: "Screen damaged" }, {});

    const settlement = await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer });

    expect(settlement.status).toBe("draft");
    expect(settlement.version).toBe(1);
    const codes = settlement.lines.map((line) => [line.code, line.label, line.amount]);
    expect(codes).toContainEqual(["salary_balance", "Salary balance", 2400]); // Oct 1–2 at ₱1,200
    expect(codes).toContainEqual(["leave_encashment", "Leave encashment: Vacation Leave", 6000]); // Sick Leave isn't convertible
    expect(codes).toContainEqual(["accountability", "Return laptop: Screen damaged", 8500]);
    expect(settlement.lines.some((line) => line.code === "thirteenth_month")).toBe(true);
    // The deadline comes from the payroll policy (seeded at 30 days), not from code.
    expect(settlement.inputs).toMatchObject({ dailyRate: 1200, lastWorkingDay: "2026-10-02", finalPayDeadlineDays: 30 });
    expect(await AuditLogModel.countDocuments({ resourceId: settlement._id, action: "final-settlement.prepared" })).toBe(1);
  });

  it("keeps one settlement per clearance, recomputing as a new version and keeping HR's manual lines", async () => {
    const s = await seed();
    const first = await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer });
    await FinalSettlementService.addManualLine(first._id.toString(), s.organizationId, { direction: "earning", label: "Performance bonus", amount: 5000, reason: "Q3 bonus" }, { userId: s.preparer });

    const second = await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(second.version).toBe(3); // prepared, manual line added, recomputed
    expect(second.lines.find((line) => line.code === "manual")).toMatchObject({ label: "Performance bonus", amount: 5000, basis: "Q3 bonus" });
  });

  it("requires a reason and a positive amount on a manual line", async () => {
    const s = await seed();
    const settlement = await FinalSettlementService.prepare(s.caseId, s.organizationId, {});
    await expect(FinalSettlementService.addManualLine(settlement._id.toString(), s.organizationId, { direction: "earning", label: "Bonus", amount: 100, reason: " " }, {})).rejects.toThrow(
      ValidationError,
    );
  });

  it("can't go to review until clearance has no blocking items left", async () => {
    const s = await seed();
    const settlement = await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer });

    await expect(FinalSettlementService.act(settlement._id.toString(), s.organizationId, { action: "submit" }, { userId: s.preparer })).rejects.toThrow(
      "Clearance still has blocking items",
    );
  });

  it("runs submit → review → approve (by someone else) → disburse, then closes the clearance", async () => {
    const s = await seed();
    await ClearanceService.actOnItem(s.caseId, s.organizationId, s.laptopId, { action: "clear" }, {});
    const id = (await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer }))._id.toString();

    await FinalSettlementService.act(id, s.organizationId, { action: "submit" }, { userId: s.preparer });
    await FinalSettlementService.act(id, s.organizationId, { action: "review" }, { userId: s.reviewer });
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "approve" }, { userId: s.preparer })).rejects.toThrow(AuthorizationError);
    await FinalSettlementService.act(id, s.organizationId, { action: "approve" }, { userId: s.approver });
    await expect(FinalSettlementService.act(id, s.organizationId, { action: "disburse", paymentMethodCode: "bank_transfer" }, { userId: s.approver })).rejects.toThrow(
      BusinessRuleError,
    );
    const paid = await FinalSettlementService.act(id, s.organizationId, { action: "disburse", paymentMethodCode: "bank_transfer", paymentReference: "BDO-2026-10-0042" }, { userId: s.approver });

    expect(paid.status).toBe("disbursed");
    expect(paid.payment).toMatchObject({ methodCode: "bank_transfer", reference: "BDO-2026-10-0042" });
    expect(paid.history.map((entry) => entry.action)).toEqual(["prepared", "submitted", "reviewed", "approved", "disbursed"]);
    const clearance = await ClearanceCaseModel.findById(s.caseId).lean();
    expect(clearance).toMatchObject({ status: "closed", active: false });
  });

  it("returns a settlement to draft with a reason, and freezes it once approved", async () => {
    const s = await seed();
    await ClearanceService.actOnItem(s.caseId, s.organizationId, s.laptopId, { action: "clear" }, {});
    const id = (await FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer }))._id.toString();
    await FinalSettlementService.act(id, s.organizationId, { action: "submit" }, { userId: s.preparer });

    await expect(FinalSettlementService.act(id, s.organizationId, { action: "return" }, { userId: s.reviewer })).rejects.toThrow(ValidationError);
    const returned = await FinalSettlementService.act(id, s.organizationId, { action: "return", note: "Bonus missing" }, { userId: s.reviewer });
    expect(returned.status).toBe("draft");

    await FinalSettlementService.act(id, s.organizationId, { action: "submit" }, { userId: s.preparer });
    await FinalSettlementService.act(id, s.organizationId, { action: "review" }, { userId: s.reviewer });
    await FinalSettlementService.act(id, s.organizationId, { action: "approve" }, { userId: s.approver });
    await expect(FinalSettlementService.prepare(s.caseId, s.organizationId, { userId: s.preparer })).rejects.toThrow(ConflictError);
  });

  it("takes the final pay deadline from the payroll policy", async () => {
    const s = await seed();
    await PayrollPolicyModel.updateMany({ organizationId: s.organizationId }, { $set: { finalPayDeadlineDays: 15 } });

    const settlement = await FinalSettlementService.prepare(s.caseId, s.organizationId, {});

    expect(settlement.inputs).toMatchObject({ finalPayDeadlineDays: 15 });
  });
});
