import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, GovernmentIdRecordModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { GovernmentIdTypeService } from "@/domains/catalog/government-id-type-service";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { dateToDateKey } from "@/lib/date-key";
import { cleanValidUntil } from "./valid-until";

/** A government ID as the service returns it. */
export type GovernmentIdRecordRow = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  personId: Types.ObjectId;
  typeCode?: string;
  otherTypeName?: string;
  idNumber: string;
  validUntil?: Date;
};

/** Exactly one of `typeCode` (a catalog code) and `otherTypeName` (HR picked "Other") is given. `validUntil` is a "YYYY-MM-DD" key. */
export type CreateGovernmentIdRecordInput = {
  organizationId: string;
  employeeId: string;
  typeCode?: string;
  otherTypeName?: string;
  idNumber: string;
  validUntil?: string;
};

/** Giving a type code switches the entry to that catalog type, giving a name switches it to "Other"; `null` clears the validity date. */
export type UpdateGovernmentIdRecordInput = {
  typeCode?: string;
  otherTypeName?: string;
  idNumber?: string;
  validUntil?: string | null;
};

/** An ID as the screens and the API read it: plain strings, blanks as null, the date as a "YYYY-MM-DD" key. */
export type GovernmentIdRecordView = { id: string; typeCode: string | null; otherTypeName: string | null; idNumber: string; validUntil: string | null };

export function toGovernmentIdRecordView(row: GovernmentIdRecordRow): GovernmentIdRecordView {
  return {
    id: row._id.toString(),
    typeCode: row.typeCode ?? null,
    otherTypeName: row.otherTypeName ?? null,
    idNumber: row.idNumber,
    validUntil: row.validUntil ? dateToDateKey(new Date(row.validUntil)) : null,
  };
}

/** The person behind an employee in this organization (IDs belong to the person, so they follow a rehire). */
async function personOf(employeeId: string, organizationId: string): Promise<Types.ObjectId> {
  const employee = await EmployeeModel.findOne({ _id: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) }).select("personId").lean();
  if (!employee) throw new NotFoundError("Employee not found in this organization");
  return employee.personId;
}

function cleanIdNumber(value: string): string {
  const number = value.trim();
  if (!number) throw new ValidationError("Enter the ID number.");
  if (number.length > 50) throw new ValidationError("An ID number can be at most 50 characters.");
  return number;
}

function cleanOtherTypeName(value: string): string {
  const name = value.trim();
  if (name.length > 100) throw new ValidationError("The ID type can be at most 100 characters.");
  return name;
}

const snapshot = (row: { typeCode?: string | null; otherTypeName?: string | null; idNumber?: string; validUntil?: Date | null } | null | undefined) => ({
  typeCode: row?.typeCode ?? undefined,
  otherTypeName: row?.otherTypeName ?? undefined,
  idNumber: row?.idNumber,
  validUntil: row?.validUntil ? dateToDateKey(new Date(row.validUntil)) : undefined,
});

/** A person's additional government IDs (the Additional government IDs card on the profile), several per type. */
export const GovernmentIdRecordService = {
  /** The employee's IDs: catalog types in catalog order, typed names last, then by number. */
  async listForEmployee(employeeId: string, organizationId: string): Promise<GovernmentIdRecordRow[]> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const [rows, types] = await Promise.all([
      GovernmentIdRecordModel.find({ organizationId: new Types.ObjectId(organizationId), personId }).lean<GovernmentIdRecordRow[]>(),
      GovernmentIdTypeService.listCurrent(organizationId),
    ]);
    const typeOrder = new Map(types.map((type) => [type.code, type.sortOrder]));
    const order = (row: GovernmentIdRecordRow) => (row.typeCode ? (typeOrder.get(row.typeCode) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER);
    return rows.sort((a, b) => order(a) - order(b) || a.idNumber.localeCompare(b.idNumber) || a._id.toString().localeCompare(b._id.toString()));
  },

  async create(input: CreateGovernmentIdRecordInput, actor: { userId?: string }): Promise<GovernmentIdRecordRow> {
    await connectMongoDB();
    const personId = await personOf(input.employeeId, input.organizationId);
    const typeCode = input.typeCode?.trim() || undefined;
    const otherTypeName = input.otherTypeName === undefined ? undefined : cleanOtherTypeName(input.otherTypeName) || undefined;
    if (!typeCode && !otherTypeName) throw new ValidationError("Choose the ID type, or type its name.");
    if (typeCode && otherTypeName) throw new ValidationError("Choose a type or type a name, not both.");
    const idNumber = cleanIdNumber(input.idNumber);
    const validUntil = cleanValidUntil(input.validUntil);
    if (typeCode) await GovernmentIdTypeService.assertValidCode(input.organizationId, typeCode);

    const created = await GovernmentIdRecordModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      personId,
      ...(typeCode ? { typeCode } : {}),
      ...(otherTypeName ? { otherTypeName } : {}),
      idNumber,
      ...(validUntil ? { validUntil } : {}),
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "government-id-record.created",
      resourceType: "GovernmentIdRecord",
      resourceId: created._id.toString(),
      after: snapshot(created),
    });
    return created.toObject() as GovernmentIdRecordRow;
  },

  /** The type is checked only when it changes, so editing the number on an ID whose type HR retired still works. */
  async update(employeeId: string, recordId: string, organizationId: string, patch: UpdateGovernmentIdRecordInput, actor: { userId?: string }): Promise<GovernmentIdRecordRow> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const orgId = new Types.ObjectId(organizationId);
    const existing = await GovernmentIdRecordModel.findOne({ _id: new Types.ObjectId(recordId), organizationId: orgId, personId }).lean<GovernmentIdRecordRow>();
    if (!existing) throw new NotFoundError("Government ID not found for this employee");

    const typeCode = patch.typeCode?.trim() || undefined;
    const otherTypeName = patch.otherTypeName === undefined ? undefined : cleanOtherTypeName(patch.otherTypeName) || undefined;
    if (typeCode && otherTypeName) throw new ValidationError("Choose a type or type a name, not both.");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (typeCode) {
      if (typeCode !== existing.typeCode) await GovernmentIdTypeService.assertValidCode(organizationId, typeCode);
      set.typeCode = typeCode;
      unset.otherTypeName = "";
    } else if (otherTypeName) {
      set.otherTypeName = otherTypeName;
      unset.typeCode = "";
    }
    if (patch.idNumber !== undefined) set.idNumber = cleanIdNumber(patch.idNumber);
    if (patch.validUntil !== undefined) {
      const validUntil = cleanValidUntil(patch.validUntil);
      if (validUntil) set.validUntil = validUntil;
      else unset.validUntil = "";
    }

    const updated = await GovernmentIdRecordModel.findOneAndUpdate(
      { _id: existing._id, organizationId: orgId, personId },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { returnDocument: "after" },
    ).lean<GovernmentIdRecordRow>();
    if (!updated) throw new NotFoundError("Government ID not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "government-id-record.updated",
      resourceType: "GovernmentIdRecord",
      resourceId: updated._id.toString(),
      before: snapshot(existing),
      after: snapshot(updated),
    });
    return updated;
  },

  async remove(employeeId: string, recordId: string, organizationId: string, actor: { userId?: string }): Promise<void> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const removed = await GovernmentIdRecordModel.findOneAndDelete({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), personId }).lean<GovernmentIdRecordRow>();
    if (!removed) throw new NotFoundError("Government ID not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "government-id-record.removed",
      resourceType: "GovernmentIdRecord",
      resourceId: removed._id.toString(),
      before: snapshot(removed),
    });
  },
};
