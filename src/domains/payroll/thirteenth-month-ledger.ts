// What has already been paid as 13th month for a year, per employee. One reader for the 13th-month run,
// its January true-up and the final settlement, so none of them can pay it twice (payroll plan Phase 3).
import { Types } from "mongoose";
import { FinalSettlementModel, PayrollAdjustmentModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { dateKeyToDate } from "@/lib/date-key";
import { roundMoney } from "./engine/money";

const PAID = ["approved", "released"];

/** Final settlements past draft are frozen, so whatever 13th month they hold is (or will be) paid there. */
const SETTLED_STATUSES = ["submitted", "reviewed", "approved", "disbursed"] as const;

/** Final settlements past draft whose last working day falls in the year, by employee id. */
export async function finalSettlementsInYear(organizationId: Types.ObjectId, year: number) {
  const settlements = await FinalSettlementModel.find({ organizationId, status: { $in: [...SETTLED_STATUSES] }, "inputs.lastWorkingDay": { $regex: `^${year}-` } })
    .select("employeeId status inputs.lastWorkingDay")
    .lean();
  return new Map(settlements.map((settlement) => [settlement.employeeId.toString(), { status: settlement.status as string, lastWorkingDay: (settlement.inputs as { lastWorkingDay?: string })?.lastWorkingDay }]));
}

/** Approved or released regular runs whose period ends in the year (untyped runs are regular). */
export async function paidRegularRunsInYear(organizationId: Types.ObjectId, year: number) {
  return PayrollRunModel.find({
    organizationId,
    runType: { $in: [null, "regular"] },
    status: { $in: PAID },
    payPeriodEnd: { $gte: dateKeyToDate(`${year}-01-01`), $lte: dateKeyToDate(`${year}-12-31`) },
  })
    .select("_id projectId payPeriodEnd")
    .lean();
}

/**
 * 13th month already paid for `year`, per employee id, net of any overpayment taken back:
 * - `thirteenth_month` adjustments in approved or released runs that say they are for the year
 *   (`thirteenthMonthYear`, e.g. a true-up paid the next January), or that say nothing and sit in a
 *   regular run of the year (adjustments entered before the field existed);
 * - the records of an approved or released 13th-month run for the year.
 */
export async function thirteenthMonthPaid(organizationId: Types.ObjectId, year: number, employeeIds?: Types.ObjectId[]): Promise<Map<string, number>> {
  const employeeFilter = employeeIds ? { employeeId: { $in: employeeIds } } : {};
  const regularRuns = await paidRegularRunsInYear(organizationId, year);
  const [adjustments, thirteenthRuns] = await Promise.all([
    PayrollAdjustmentModel.find({
      organizationId,
      category: "thirteenth_month",
      ...employeeFilter,
      $or: [{ thirteenthMonthYear: year }, { thirteenthMonthYear: null, payrollRunId: { $in: regularRuns.map((run) => run._id) } }],
    })
      .select("payrollRunId employeeId direction amount thirteenthMonthYear")
      .lean(),
    PayrollRunModel.find({ organizationId, runType: "thirteenth_month", status: { $in: PAID }, payPeriodStart: dateKeyToDate(`${year}-01-01`) }).select("_id").lean(),
  ]);

  // An adjustment tagged for the year counts only once its own run is approved or released.
  const taggedRunIds = [...new Set(adjustments.filter((adjustment) => adjustment.thirteenthMonthYear === year).map((adjustment) => adjustment.payrollRunId.toString()))];
  const paidTaggedRuns = new Set(
    taggedRunIds.length
      ? (await PayrollRunModel.find({ _id: { $in: taggedRunIds.map((id) => new Types.ObjectId(id)) }, status: { $in: PAID } }).select("_id").lean()).map((run) => run._id.toString())
      : [],
  );
  const records = thirteenthRuns.length
    ? await PayrollRecordModel.find({ payrollRunId: { $in: thirteenthRuns.map((run) => run._id) }, ...employeeFilter }).select("employeeId netPay").lean()
    : [];

  const paid = new Map<string, number>();
  const add = (employeeId: Types.ObjectId, amount: number) => paid.set(employeeId.toString(), roundMoney((paid.get(employeeId.toString()) ?? 0) + amount));
  for (const adjustment of adjustments) {
    if (adjustment.thirteenthMonthYear === year && !paidTaggedRuns.has(adjustment.payrollRunId.toString())) continue;
    add(adjustment.employeeId, adjustment.direction === "deduction" ? -adjustment.amount : adjustment.amount);
  }
  for (const record of records) add(record.employeeId, record.netPay);
  return paid;
}
