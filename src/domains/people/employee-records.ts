import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { ClearanceCaseModel, FinalSettlementModel, PayrollRecordModel, PayrollRunModel, ReviewCycleModel, TravelOrderModel } from "@/server/db/models";

/**
 * One employee's records from the modules that don't have a per-employee
 * query of their own, for the tabs on their profile. Always scoped to the
 * organization; each loader runs only when its tab is open.
 */
export const EmployeeRecords = {
  /** Their lines in every payroll run that wasn't cancelled, newest pay date first. */
  async payslips(employeeId: string, organizationId: string) {
    await connectMongoDB();
    const orgId = new Types.ObjectId(organizationId);
    const records = await PayrollRecordModel.find({ organizationId: orgId, employeeId: new Types.ObjectId(employeeId) })
      .select("payrollRunId grossPay netPay")
      .lean<{ _id: Types.ObjectId; payrollRunId: Types.ObjectId; grossPay: number; netPay: number }[]>();
    const runs = await PayrollRunModel.find({ organizationId: orgId, _id: { $in: records.map((record) => record.payrollRunId) }, status: { $ne: "cancelled" } })
      .select("runNumber status payPeriodStart payPeriodEnd payDate")
      .lean<{ _id: Types.ObjectId; runNumber: string; status: string; payPeriodStart: Date; payPeriodEnd: Date; payDate: Date }[]>();
    const runById = new Map(runs.map((run) => [run._id.toString(), run]));
    return records
      .flatMap((record) => {
        const run = runById.get(record.payrollRunId.toString());
        return run ? [{ id: record._id.toString(), runId: run._id.toString(), runNumber: run.runNumber, status: run.status, periodStart: run.payPeriodStart, periodEnd: run.payPeriodEnd, payDate: run.payDate, grossPay: record.grossPay, netPay: record.netPay }] : [];
      })
      .sort((a, b) => new Date(b.payDate).getTime() - new Date(a.payDate).getTime());
  },

  /** Travel orders they're on, latest first. */
  async travelOrders(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return TravelOrderModel.find({ organizationId: new Types.ObjectId(organizationId), employeeIds: new Types.ObjectId(employeeId) })
      .select("startDate endDate remarks status employeeIds")
      .sort({ startDate: -1 })
      .lean<{ _id: Types.ObjectId; startDate: Date; endDate: Date; remarks?: string; status: string; employeeIds: Types.ObjectId[] }[]>();
  },

  /** Their clearance cases (normally one) with the final settlement of each. */
  async offboarding(employeeId: string, organizationId: string) {
    await connectMongoDB();
    const orgId = new Types.ObjectId(organizationId);
    const [cases, separationTypes] = await Promise.all([
      ClearanceCaseModel.find({ organizationId: orgId, employeeId: new Types.ObjectId(employeeId) })
        .select("separationTypeCode lastWorkingDay status createdAt")
        .sort({ createdAt: -1 })
        .lean<{ _id: Types.ObjectId; separationTypeCode: string; lastWorkingDay: Date; status: string }[]>(),
      SeparationTypeService.listCurrent(organizationId),
    ]);
    const typeName = new Map(separationTypes.map((type) => [type.code, type.name]));
    const settlements = await FinalSettlementModel.find({ organizationId: orgId, clearanceCaseId: { $in: cases.map((item) => item._id) } })
      .select("clearanceCaseId status lines")
      .lean<{ _id: Types.ObjectId; clearanceCaseId: Types.ObjectId; status: string; lines?: { direction: string; amount: number }[] }[]>();
    const settlementByCase = new Map(settlements.map((settlement) => [settlement.clearanceCaseId.toString(), settlement]));
    return cases.map((item) => {
      const settlement = settlementByCase.get(item._id.toString());
      const net = settlement?.lines?.reduce((sum, line) => sum + (line.direction === "deduction" ? -line.amount : line.amount), 0) ?? null;
      return {
        id: item._id.toString(),
        separationType: typeName.get(item.separationTypeCode) ?? item.separationTypeCode,
        lastWorkingDay: item.lastWorkingDay,
        status: item.status,
        settlement: settlement ? { id: settlement._id.toString(), status: settlement.status, net } : null,
      };
    });
  },

  /** Review cycle names by id, for the Performance tab. */
  async reviewCycleNames(organizationId: string, ids: Types.ObjectId[]) {
    await connectMongoDB();
    const cycles = await ReviewCycleModel.find({ organizationId: new Types.ObjectId(organizationId), _id: { $in: ids } })
      .select("name")
      .lean<{ _id: Types.ObjectId; name: string }[]>();
    return new Map(cycles.map((cycle) => [cycle._id.toString(), cycle.name]));
  },
};
