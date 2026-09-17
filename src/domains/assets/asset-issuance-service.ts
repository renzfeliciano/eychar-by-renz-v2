import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AssetIssuanceModel, EmployeeModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateAssetIssuanceInput, UpdateAssetIssuanceInput } from "@/shared/validation/asset-issuance";

function assertDateOrder(issuedDate: Date, returnedDate?: Date) {
  if (returnedDate && returnedDate < issuedDate) throw new BusinessRuleError("Return date must be on or after the issued date");
}

export const AssetIssuanceService = {
  async create(employeeId: string, input: CreateAssetIssuanceInput, actor: { userId?: string }) {
    await connectMongoDB();
    assertDateOrder(input.issuedDate, input.returnedDate);

    const employeeExists = await EmployeeModel.exists({
      _id: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");

    const record = await AssetIssuanceModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: new Types.ObjectId(employeeId),
      assetName: input.assetName,
      assetType: input.assetType,
      serialNumber: input.serialNumber,
      condition: input.condition,
      issuedDate: input.issuedDate,
      returnedDate: input.returnedDate,
      remarks: input.remarks,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "asset-issuance.created",
      resourceType: "AssetIssuance",
      resourceId: record._id.toString(),
      after: { assetName: record.assetName, condition: record.condition },
    });

    return record;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateAssetIssuanceInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();

    const record = await AssetIssuanceModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!record) throw new NotFoundError("Asset issuance record not found in this organization");

    assertDateOrder(patch.issuedDate, patch.returnedDate);
    const before = { condition: record.condition, returnedDate: record.returnedDate };
    record.assetName = patch.assetName;
    record.assetType = patch.assetType;
    record.serialNumber = patch.serialNumber;
    record.condition = patch.condition;
    record.issuedDate = patch.issuedDate;
    record.returnedDate = patch.returnedDate;
    record.remarks = patch.remarks;
    await record.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "asset-issuance.updated",
      resourceType: "AssetIssuance",
      resourceId: record._id.toString(),
      before,
      after: { condition: record.condition, returnedDate: record.returnedDate },
    });

    return record;
  },

  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return AssetIssuanceModel.find({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) })
      .sort({ issuedDate: -1, createdAt: -1 })
      .lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const record = await AssetIssuanceModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) }).lean();
    if (!record) throw new NotFoundError("Asset issuance record not found in this organization");
    return record;
  },
};
