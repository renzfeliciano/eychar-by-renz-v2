import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PayrollRunModel, PayrollScheduleModel, ProjectModel } from "@/server/db/models";
import { assertOptionalInOrganization } from "@/server/db/assert-in-organization";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import { addDays, dateKeyToDate, dateToDateKey, localDateKey } from "@/lib/date-key";
import { periodContaining, periodEndingOnOrBefore, type CutoffSpec, type PayPeriod } from "./engine/pay-periods";
import type { PayFrequency } from "./engine/pay-frequency";
import { PayrollRunService } from "./payroll-run-service";
import type { CreatePayrollScheduleInput, UpdatePayrollScheduleInput } from "@/shared/validation/payroll";

export type PrepareOutcome =
  | { scheduleId: string; outcome: "prepared" | "exists"; period: PayPeriod; runNumber: string }
  | { scheduleId: string; outcome: "not_started"; period: PayPeriod }
  | { scheduleId: string; outcome: "failed"; period: PayPeriod; error: string };

function specOf(schedule: { payFrequency: string; cutoffDay: number; payDateOffsetDays: number }): CutoffSpec {
  return { payFrequency: schedule.payFrequency as PayFrequency, cutoffDay: schedule.cutoffDay, payDateOffsetDays: schedule.payDateOffsetDays };
}

/**
 * Payroll calendars (ADR-029). A schedule only ever prepares drafts: the day
 * after each cutoff closes, `prepareDue` creates that period's draft run
 * (if none exists yet for the same people), and HR reviews, submits and
 * approves it as usual. It runs from the cron endpoint and whenever the
 * payroll screen opens, so a missed cron day catches up on its own.
 */
export const PayrollScheduleService = {
  async create(input: CreatePayrollScheduleInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");
    const schedule = await PayrollScheduleModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      name: input.name,
      payFrequency: input.payFrequency,
      cutoffDay: input.cutoffDay,
      payDateOffsetDays: input.payDateOffsetDays,
      autoPrepare: input.autoPrepare,
      startsOn: dateKeyToDate(input.startsOn ?? localDateKey()),
    });
    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-schedule.created",
      resourceType: "PayrollSchedule",
      resourceId: schedule._id.toString(),
      after: { name: schedule.name, payFrequency: schedule.payFrequency, cutoffDay: schedule.cutoffDay, projectId: schedule.projectId, autoPrepare: schedule.autoPrepare },
    });
    return schedule;
  },

  async update(id: string, input: UpdatePayrollScheduleInput, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Payroll schedule not found in this organization");
    const schedule = await PayrollScheduleModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(input.organizationId) });
    if (!schedule) throw new NotFoundError("Payroll schedule not found in this organization");
    await assertOptionalInOrganization(ProjectModel, input.projectId, input.organizationId, "Project");

    const before = { name: schedule.name, payFrequency: schedule.payFrequency, cutoffDay: schedule.cutoffDay, payDateOffsetDays: schedule.payDateOffsetDays, autoPrepare: schedule.autoPrepare, status: schedule.status };
    const { name, payFrequency, cutoffDay, payDateOffsetDays, autoPrepare, status, projectId, startsOn } = input;
    const fields = { name, payFrequency, cutoffDay, payDateOffsetDays, autoPrepare, status };
    schedule.set(Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)));
    if (projectId !== undefined) schedule.set({ projectId: projectId ? new Types.ObjectId(projectId) : undefined });
    if (startsOn) schedule.set({ startsOn: dateKeyToDate(startsOn) });
    await schedule.save();

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "payroll-schedule.updated",
      resourceType: "PayrollSchedule",
      resourceId: id,
      before,
      after: { name: schedule.name, payFrequency: schedule.payFrequency, cutoffDay: schedule.cutoffDay, payDateOffsetDays: schedule.payDateOffsetDays, autoPrepare: schedule.autoPrepare, status: schedule.status },
    });
    return schedule;
  },

  /** Schedules with the cutoff in progress and the last one that closed, for the schedules screen. */
  async list(organizationId: string, today: string = localDateKey()) {
    await connectMongoDB();
    const schedules = await PayrollScheduleModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ name: 1 }).lean();
    const lastRuns = await PayrollRunModel.find({ _id: { $in: schedules.map((schedule) => schedule.lastRunId).filter(Boolean) } }).select("runNumber").lean();
    const runNumberById = new Map(lastRuns.map((run) => [run._id.toString(), run.runNumber as string]));
    return schedules.map((schedule) => ({
      ...schedule,
      lastRunNumber: schedule.lastRunId ? (runNumberById.get(schedule.lastRunId.toString()) ?? null) : null,
      currentPeriod: periodContaining(specOf(schedule), today),
      lastClosedPeriod: periodEndingOnOrBefore(specOf(schedule), addDays(today, -1)),
    }));
  },

  /**
   * Prepares the draft for each active, automatic schedule whose latest
   * cutoff closed before `today`. Idempotent: an existing run over those
   * dates for the same people counts as done. Failures (e.g. no policy yet)
   * are recorded on the schedule, never thrown, so one bad schedule doesn't
   * stop the rest. Without `organizationId`, covers every organization (cron).
   */
  async prepareDue({ organizationId, today = localDateKey() }: { organizationId?: string; today?: string } = {}): Promise<PrepareOutcome[]> {
    await connectMongoDB();
    const schedules = await PayrollScheduleModel.find({
      status: "active",
      autoPrepare: true,
      ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}),
    }).lean();

    const outcomes: PrepareOutcome[] = [];
    for (const schedule of schedules) {
      const scheduleId = schedule._id.toString();
      const period = periodEndingOnOrBefore(specOf(schedule), addDays(today, -1));
      if (period.end < dateToDateKey(schedule.startsOn)) {
        outcomes.push({ scheduleId, outcome: "not_started", period });
        continue;
      }

      const existing = await PayrollRunModel.findOne({
        organizationId: schedule.organizationId,
        status: { $ne: "cancelled" },
        payPeriodStart: dateKeyToDate(period.start),
        payPeriodEnd: dateKeyToDate(period.end),
        ...(schedule.projectId ? { projectId: schedule.projectId } : { projectId: { $exists: false } }),
      }).lean();
      if (existing) {
        outcomes.push({ scheduleId, outcome: "exists", period, runNumber: existing.runNumber });
        continue;
      }

      try {
        const run = await PayrollRunService.prepare(
          {
            organizationId: schedule.organizationId.toString(),
            projectId: schedule.projectId?.toString(),
            payPeriodStart: period.start,
            payPeriodEnd: period.end,
            payDate: period.payDate,
          },
          {},
          { source: { type: "schedule", scheduleId } },
        );
        await PayrollScheduleModel.updateOne(
          { _id: schedule._id },
          { $set: { lastPreparedPeriodEnd: dateKeyToDate(period.end), lastRunId: run._id, lastAttemptAt: new Date() }, $unset: { lastError: 1 } },
        );
        outcomes.push({ scheduleId, outcome: "prepared", period, runNumber: run.runNumber });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Couldn't prepare the run";
        await PayrollScheduleModel.updateOne({ _id: schedule._id }, { $set: { lastError: message, lastAttemptAt: new Date() } });
        outcomes.push({ scheduleId, outcome: "failed", period, error: message });
      }
    }
    return outcomes;
  },
};
