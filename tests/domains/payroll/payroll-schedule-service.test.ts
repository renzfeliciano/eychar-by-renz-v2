import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRunModel, PayrollScheduleModel } from "@/server/db/models";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { dateKeyToDate } from "@/lib/date-key";
import { seedEmployee, seedPayrollOrganization } from "./fixtures";

describe("PayrollScheduleService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  async function seedSchedule(options: { withPolicy?: boolean } = {}) {
    const org = await seedPayrollOrganization(options);
    await seedEmployee(org.organizationId, "Angela", { projectId: org.projectId });
    const schedule = await PayrollScheduleService.create(
      { organizationId: org.organizationId, projectId: org.projectId, name: "EGI Rufino semi-monthly", payFrequency: "semi-monthly", cutoffDay: 10, payDateOffsetDays: 5, autoPrepare: true, startsOn: "2026-09-01" },
      {},
    );
    return { ...org, scheduleId: schedule._id.toString() };
  }

  it("prepares a draft for the cutoff that just closed, once", async () => {
    const { organizationId, projectId, scheduleId } = await seedSchedule();

    const first = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-10-12" });
    expect(first).toEqual([{ scheduleId, outcome: "prepared", period: { start: "2026-09-26", end: "2026-10-10", payDate: "2026-10-15" }, runNumber: "PR-2026-0001" }]);

    const run = await PayrollRunModel.findOne({ organizationId }).lean();
    expect(run).toMatchObject({ status: "draft", source: { type: "schedule" } });
    expect(run!.projectId?.toString()).toBe(projectId);
    expect(run!.payPeriodStart).toEqual(dateKeyToDate("2026-09-26"));

    // Running again the same day (or the next) finds the run already there.
    const again = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-10-13" });
    expect(again[0]).toMatchObject({ outcome: "exists", runNumber: "PR-2026-0001" });
    expect(await PayrollRunModel.countDocuments({ organizationId })).toBe(1);
  });

  it("waits until the day after the cutoff, and ignores periods before the schedule started", async () => {
    const { organizationId } = await seedSchedule();
    // On Oct 10 the Sep 26–Oct 10 cutoff is still open, so the one due is Sep 11–25.
    const onCutoffDay = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-10-10" });
    expect(onCutoffDay[0]).toMatchObject({ outcome: "prepared", period: { start: "2026-09-11", end: "2026-09-25" } });

    const tooEarly = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-09-05" });
    expect(tooEarly[0]).toMatchObject({ outcome: "not_started" });
  });

  it("records why it couldn't prepare, without throwing", async () => {
    const { organizationId, scheduleId } = await seedSchedule({ withPolicy: false });

    const result = await PayrollScheduleService.prepareDue({ organizationId, today: "2026-10-12" });

    expect(result[0]).toMatchObject({ outcome: "failed", error: "No payroll policy applies to this period. Add one under Payroll › Policies." });
    const schedule = await PayrollScheduleModel.findById(scheduleId).lean();
    expect(schedule?.lastError).toBe("No payroll policy applies to this period. Add one under Payroll › Policies.");
  });

  it("skips schedules that are inactive or set to manual", async () => {
    const { organizationId, scheduleId } = await seedSchedule();
    await PayrollScheduleService.update(scheduleId, { organizationId, autoPrepare: false }, {});
    expect(await PayrollScheduleService.prepareDue({ organizationId, today: "2026-10-12" })).toEqual([]);
  });

  it("describes the current and next cutoffs for the schedule screen", async () => {
    const { organizationId } = await seedSchedule();
    const [row] = await PayrollScheduleService.list(organizationId, "2026-10-12");
    expect(row.currentPeriod).toEqual({ start: "2026-10-11", end: "2026-10-25", payDate: "2026-10-30" });
    expect(row.lastClosedPeriod).toEqual({ start: "2026-09-26", end: "2026-10-10", payDate: "2026-10-15" });
  });
});
