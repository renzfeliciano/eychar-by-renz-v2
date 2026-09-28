import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, PayrollRunModel, PayrollRecordModel } from "@/server/db/models";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { dateKeyToDate, dateKeysBetween, weekdayOf } from "@/lib/date-key";
import { markAttendance, seedEmployee, seedPayrollOrganization } from "./fixtures";

// Oct 1–15, 2026: 11 workdays under a Mon–Fri week (Oct 1 is a Thursday).
const PERIOD = { payPeriodStart: "2026-10-01", payPeriodEnd: "2026-10-15", payDate: "2026-10-20" };
const WORKDAYS = dateKeysBetween("2026-10-01", "2026-10-15").filter((date) => ![0, 6].includes(weekdayOf(date)));
const HR = { userId: new Types.ObjectId().toString() };

async function attendEvery(organizationId: string, employeeId: string, days: string[], status = "present") {
  for (const date of days) await markAttendance(organizationId, employeeId, date, status);
}

async function seedCrew() {
  const org = await seedPayrollOrganization();
  const angela = await seedEmployee(org.organizationId, "Angela", { projectId: org.projectId, compensation: { rateType: "monthly", rate: 30000 } });
  const carlos = await seedEmployee(org.organizationId, "Carlos", { projectId: org.projectId, compensation: { rateType: "daily", rate: 700, minimumWageEarner: true } });
  const ben = await seedEmployee(org.organizationId, "Ben", { projectId: org.otherProjectId, hiredOn: "2026-10-08", compensation: { rateType: "monthly", rate: 30000 } });
  await seedEmployee(org.organizationId, "Unpaid", { projectId: org.projectId, compensation: null });
  await seedEmployee(org.organizationId, "Former", { status: "resigned", compensation: { rateType: "monthly", rate: 30000 } });

  await attendEvery(org.organizationId, angela, WORKDAYS.slice(1));
  await markAttendance(org.organizationId, angela, WORKDAYS[0], "absent");
  await attendEvery(org.organizationId, carlos, WORKDAYS.slice(1));
  return { ...org, angela, carlos, ben };
}

const recordOf = async (runId: string, employeeId: string) => PayrollRecordModel.findOne({ payrollRunId: runId, employeeId }).lean();

describe("PayrollRunService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  describe("prepare", () => {
    it("drafts a run for everyone employed in the period, explaining anyone it can't pay", async () => {
      const { organizationId, angela, carlos, ben } = await seedCrew();

      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);

      expect(run).toMatchObject({ status: "draft", runNumber: "PR-2026-0001", payFrequency: "semi-monthly" });
      expect(run.exclusions.map((exclusion: { employeeName: string; reason: string }) => [exclusion.employeeName, exclusion.reason])).toEqual([["Unpaid Santos", "No pay terms on Oct 15, 2026"]]);

      const records = await PayrollRecordModel.find({ payrollRunId: run._id }).lean();
      expect(records.map((record) => record.employeeName).sort()).toEqual(["Angela Santos", "Ben Santos", "Carlos Santos"]);
      expect(run.totals.employees).toBe(3);
      expect(run.totals.netPay).toBeCloseTo(records.reduce((sum, record) => sum + record.netPay, 0), 2);

      const angelaRecord = (await recordOf(run._id.toString(), angela))!;
      expect(angelaRecord.attendance).toMatchObject({ scheduledDays: 11, eligibleDays: 11, daysWorked: 10, absentDays: 1, missingDays: 0 });
      expect(angelaRecord.earnings.slice(0, 2)).toEqual([
        { code: "basic", label: "Basic pay", amount: 15000, taxable: true },
        { code: "absences", label: "Absences (1 day)", amount: -1379.31, taxable: true },
      ]);

      const carlosRecord = (await recordOf(run._id.toString(), carlos))!;
      expect(carlosRecord.earnings[0]).toMatchObject({ amount: 7000 });
      expect(carlosRecord.tax).toBe(0);
      expect(carlosRecord.warnings.map((warning: { code: string }) => warning.code)).toEqual(["missing_attendance"]);

      // Hired Oct 8: 6 of the 11 workdays.
      const benRecord = (await recordOf(run._id.toString(), ben))!;
      expect(benRecord.earnings[0]).toMatchObject({ label: "Basic pay (6 of 11 days)", amount: 8275.86 });
    });

    it("pays one project's crew only, when scoped to a project", async () => {
      const { organizationId, projectId } = await seedCrew();

      const run = await PayrollRunService.prepare({ organizationId, projectId, ...PERIOD }, HR);

      const records = await PayrollRecordModel.find({ payrollRunId: run._id }).lean();
      expect(records.map((record) => record.employeeName).sort()).toEqual(["Angela Santos", "Carlos Santos"]);
      expect(records.every((record) => record.projectId?.toString() === projectId)).toBe(true);
      expect(run.projectId?.toString()).toBe(projectId);
    });

    it("never pays the same people twice for overlapping dates, until the first run is cancelled", async () => {
      const { organizationId, projectId, otherProjectId } = await seedCrew();
      const projectRun = await PayrollRunService.prepare({ organizationId, projectId, ...PERIOD }, HR);

      await expect(PayrollRunService.prepare({ organizationId, ...PERIOD, payPeriodStart: "2026-10-10" }, HR)).rejects.toThrow(ConflictError);
      await expect(PayrollRunService.prepare({ organizationId, projectId, ...PERIOD }, HR)).rejects.toThrow(/PR-2026-0001 already covers/);
      // Another project's crew for the same dates is fine.
      await expect(PayrollRunService.prepare({ organizationId, projectId: otherProjectId, ...PERIOD }, HR)).resolves.toMatchObject({ runNumber: "PR-2026-0002" });

      await PayrollRunService.act(projectRun._id.toString(), { organizationId, action: "cancel", reason: "Wrong cutoff" }, HR);
      await expect(PayrollRunService.prepare({ organizationId, projectId, ...PERIOD }, HR)).resolves.toMatchObject({ status: "draft" });
    });

    it("refuses to start without a payroll policy, writing nothing", async () => {
      const { organizationId } = await seedPayrollOrganization({ withPolicy: false });
      await expect(PayrollRunService.prepare({ organizationId, ...PERIOD }, HR)).rejects.toThrow(NotFoundError);
      expect(await PayrollRunModel.countDocuments({ organizationId })).toBe(0);
    });
  });

  describe("adjustments", () => {
    it("recomputes the draft when an adjustment is added or removed, and locks them once submitted", async () => {
      const { organizationId, angela } = await seedCrew();
      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
      const runId = run._id.toString();
      const netBefore = (await recordOf(runId, angela))!.netPay;

      const adjustment = await PayrollRunService.addAdjustment(
        runId,
        { organizationId, employeeId: angela, category: "cash_advance", label: "Cash advance", direction: "deduction", amount: 1000, taxable: false },
        HR,
      );
      const afterAdd = (await recordOf(runId, angela))!;
      expect(afterAdd.deductions).toEqual([{ code: "cash_advance", label: "Cash advance", amount: 1000 }]);
      expect(afterAdd.netPay).toBeCloseTo(netBefore - 1000, 2);

      await PayrollRunService.removeAdjustment(runId, adjustment._id.toString(), organizationId, HR);
      expect((await recordOf(runId, angela))!.netPay).toBe(netBefore);

      await PayrollRunService.act(runId, { organizationId, action: "submit" }, HR);
      await expect(
        PayrollRunService.addAdjustment(runId, { organizationId, employeeId: angela, category: "overtime", label: "Overtime", direction: "earning", amount: 500, taxable: true }, HR),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("won't submit a run with a blocking issue such as negative net pay", async () => {
      const { organizationId, angela } = await seedCrew();
      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
      await PayrollRunService.addAdjustment(
        run._id.toString(),
        { organizationId, employeeId: angela, category: "company_loan", label: "Company loan", direction: "deduction", amount: 99999, taxable: false },
        HR,
      );

      await expect(PayrollRunService.act(run._id.toString(), { organizationId, action: "submit" }, HR)).rejects.toThrow(/1 employee has a blocking issue/);
    });
  });

  describe("lifecycle", () => {
    it("goes draft → submitted → approved → released, recording who did what", async () => {
      const { organizationId } = await seedCrew();
      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
      const runId = run._id.toString();

      await PayrollRunService.act(runId, { organizationId, action: "submit" }, HR);
      // The preparer may approve their own run; the audit trail says so.
      await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
      const released = await PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: "2026-10-20", paymentReference: "BDO batch 1020" }, HR);

      expect(released).toMatchObject({ status: "released", paymentReference: "BDO batch 1020" });
      expect(released.releasedOn).toEqual(dateKeyToDate("2026-10-20"));
      expect(released.history.map((entry: { action: string; status: string }) => `${entry.action}:${entry.status}`)).toEqual(["prepared:draft", "submitted:submitted", "approved:approved", "released:released"]);
      const approval = await AuditLogModel.findOne({ resourceId: run._id, action: "payroll-run.approved" }).lean();
      expect(approval?.metadata).toMatchObject({ selfApproved: true });

      await expect(PayrollRunService.act(runId, { organizationId, action: "cancel", reason: "Too late" }, HR)).rejects.toThrow(BusinessRuleError);
      await expect(PayrollRunService.act(runId, { organizationId, action: "recompute" }, HR)).rejects.toThrow(BusinessRuleError);
    });

    it("returns a submitted run to draft with the reason, and rejects out-of-order steps", async () => {
      const { organizationId } = await seedCrew();
      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
      const runId = run._id.toString();

      await expect(PayrollRunService.act(runId, { organizationId, action: "approve" }, HR)).rejects.toThrow(/Only a submitted run can be approved/);
      await PayrollRunService.act(runId, { organizationId, action: "submit" }, HR);
      const returned = await PayrollRunService.act(runId, { organizationId, action: "return", reason: "Add Carlos's overtime" }, HR);

      expect(returned.status).toBe("draft");
      expect(returned.history.at(-1)).toMatchObject({ action: "returned", status: "draft", note: "Add Carlos's overtime" });
    });

    it("keeps a released run exactly as paid when pay terms change later", async () => {
      const { organizationId, angela } = await seedCrew();
      const run = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
      const runId = run._id.toString();
      await PayrollRunService.act(runId, { organizationId, action: "submit" }, HR);
      await PayrollRunService.act(runId, { organizationId, action: "approve" }, HR);
      await PayrollRunService.act(runId, { organizationId, action: "release", releasedOn: "2026-10-20" }, HR);
      const paid = (await recordOf(runId, angela))!.netPay;

      await CompensationService.revise(angela, organizationId, { rateType: "monthly", rate: 60000, allowances: [], minimumWageEarner: false, effectiveFrom: "2026-10-02" }, HR);

      const detail = await PayrollRunService.getDetail(runId, organizationId);
      expect(detail.records.find((record) => record.employeeId.toString() === angela)?.netPay).toBe(paid);
    });
  });

  it("flags a big change in net pay against the employee's last released payroll", async () => {
    const { organizationId, angela } = await seedCrew();
    const first = await PayrollRunService.prepare({ organizationId, ...PERIOD }, HR);
    for (const action of ["submit", "approve"] as const) await PayrollRunService.act(first._id.toString(), { organizationId, action }, HR);
    await PayrollRunService.act(first._id.toString(), { organizationId, action: "release", releasedOn: "2026-10-20" }, HR);

    await CompensationService.revise(angela, organizationId, { rateType: "monthly", rate: 45000, allowances: [], minimumWageEarner: false, effectiveFrom: "2026-10-16" }, HR);
    const second = await PayrollRunService.prepare({ organizationId, payPeriodStart: "2026-10-16", payPeriodEnd: "2026-10-31", payDate: "2026-11-05" }, HR);

    const record = (await recordOf(second._id.toString(), angela))!;
    expect(record.previousNetPay).toBe((await recordOf(first._id.toString(), angela))!.netPay);
    expect(record.warnings.find((warning: { code: string }) => warning.code === "net_pay_change")?.message).toMatch(/^Net pay is up \d+% from the last payroll/);
  });
});
