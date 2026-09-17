import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { TravelOrderModel, EmployeeModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateTravelOrderInput, UpdateTravelOrderInput } from "@/shared/validation/travel-orders";

/**
 * Only checks the employees exist in this organization — their name/number
 * are resolved live from Employee/Person at read time (same "derive at read
 * time" precedent as every other entity-reference field in this app), not
 * snapshotted onto the travel order.
 */
async function assertEmployeesExist(organizationId: string, employeeIds: string[]) {
  const count = await EmployeeModel.countDocuments({
    _id: { $in: employeeIds.map((id) => new Types.ObjectId(id)) },
    organizationId: new Types.ObjectId(organizationId),
  });
  if (count !== new Set(employeeIds).size) throw new NotFoundError("One or more employees not found in this organization");
}

function assertDateOrder(startDate: Date, endDate: Date) {
  if (endDate < startDate) throw new BusinessRuleError("End date must be on or after the start date");
}

export const TravelOrderService = {
  async create(input: CreateTravelOrderInput, actor: { userId?: string }) {
    await connectMongoDB();
    assertDateOrder(input.startDate, input.endDate);
    await assertEmployeesExist(input.organizationId, input.employeeIds);

    const order = await TravelOrderModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeIds: input.employeeIds.map((id) => new Types.ObjectId(id)),
      startDate: input.startDate,
      endDate: input.endDate,
      remarks: input.remarks,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "travel-order.created",
      resourceType: "TravelOrder",
      resourceId: order._id.toString(),
      after: { employeeIds: order.employeeIds, startDate: order.startDate, endDate: order.endDate },
    });

    return order;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateTravelOrderInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();

    const order = await TravelOrderModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!order) throw new NotFoundError("Travel order not found in this organization");

    assertDateOrder(patch.startDate, patch.endDate);
    await assertEmployeesExist(organizationId, patch.employeeIds);

    const before = { employeeIds: order.employeeIds, startDate: order.startDate, endDate: order.endDate };
    order.employeeIds = patch.employeeIds.map((employeeId) => new Types.ObjectId(employeeId));
    order.startDate = patch.startDate;
    order.endDate = patch.endDate;
    order.remarks = patch.remarks;
    await order.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "travel-order.updated",
      resourceType: "TravelOrder",
      resourceId: order._id.toString(),
      before,
      after: { employeeIds: order.employeeIds, startDate: order.startDate, endDate: order.endDate },
    });

    return order;
  },

  async cancel(id: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();

    const order = await TravelOrderModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!order) throw new NotFoundError("Travel order not found in this organization");
    if (order.status === "cancelled") throw new BusinessRuleError("This travel order is already cancelled");

    order.status = "cancelled";
    await order.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "travel-order.cancelled",
      resourceType: "TravelOrder",
      resourceId: order._id.toString(),
      before: { status: "scheduled" },
      after: { status: "cancelled" },
    });

    return order;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return TravelOrderModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ startDate: -1, createdAt: -1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const order = await TravelOrderModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!order) throw new NotFoundError("Travel order not found in this organization");
    return order;
  },
};
