import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, ProfessionalLicenseRecordModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { PrcProfessionService } from "@/domains/catalog/prc-profession-service";
import { NotFoundError, ValidationError } from "@/shared/errors";
import { dateToDateKey } from "@/lib/date-key";
import { cleanValidUntil } from "./valid-until";

/** A PRC license as the service returns it. */
export type ProfessionalLicenseRecordRow = {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  personId: Types.ObjectId;
  professionCode: string;
  licenseNumber: string;
  validUntil?: Date;
};

/** `professionCode` is a PRC professions catalog code; `validUntil` is a "YYYY-MM-DD" key. */
export type CreateProfessionalLicenseRecordInput = {
  organizationId: string;
  employeeId: string;
  professionCode: string;
  licenseNumber: string;
  validUntil?: string;
};

/** `null` clears the validity date. */
export type UpdateProfessionalLicenseRecordInput = {
  professionCode?: string;
  licenseNumber?: string;
  validUntil?: string | null;
};

/** A license as the screens and the API read it: plain strings, the date as a "YYYY-MM-DD" key or null. */
export type ProfessionalLicenseRecordView = { id: string; professionCode: string; licenseNumber: string; validUntil: string | null };

export function toProfessionalLicenseRecordView(row: ProfessionalLicenseRecordRow): ProfessionalLicenseRecordView {
  return { id: row._id.toString(), professionCode: row.professionCode, licenseNumber: row.licenseNumber, validUntil: row.validUntil ? dateToDateKey(new Date(row.validUntil)) : null };
}

/** The person behind an employee in this organization (licenses belong to the person, so they follow a rehire). */
async function personOf(employeeId: string, organizationId: string): Promise<Types.ObjectId> {
  const employee = await EmployeeModel.findOne({ _id: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) }).select("personId").lean();
  if (!employee) throw new NotFoundError("Employee not found in this organization");
  return employee.personId;
}

function cleanProfession(value: string): string {
  const code = value.trim();
  if (!code) throw new ValidationError("Choose the profession.");
  return code;
}

function cleanLicenseNumber(value: string): string {
  const number = value.trim();
  if (!number) throw new ValidationError("Enter the license number.");
  if (number.length > 50) throw new ValidationError("A license number can be at most 50 characters.");
  return number;
}

const snapshot = (row: { professionCode?: string; licenseNumber?: string; validUntil?: Date | null } | null | undefined) => ({
  professionCode: row?.professionCode,
  licenseNumber: row?.licenseNumber,
  validUntil: row?.validUntil ? dateToDateKey(new Date(row.validUntil)) : undefined,
});

/** A person's PRC licenses (the PRC licenses card on the profile), several per profession. */
export const ProfessionalLicenseRecordService = {
  /** The employee's licenses, in the profession's catalog order, then by number. */
  async listForEmployee(employeeId: string, organizationId: string): Promise<ProfessionalLicenseRecordRow[]> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const [rows, professions] = await Promise.all([
      ProfessionalLicenseRecordModel.find({ organizationId: new Types.ObjectId(organizationId), personId }).lean<ProfessionalLicenseRecordRow[]>(),
      PrcProfessionService.listCurrent(organizationId),
    ]);
    const professionOrder = new Map(professions.map((profession) => [profession.code, profession.sortOrder]));
    const order = (row: ProfessionalLicenseRecordRow) => professionOrder.get(row.professionCode) ?? Number.MAX_SAFE_INTEGER;
    return rows.sort((a, b) => order(a) - order(b) || a.licenseNumber.localeCompare(b.licenseNumber) || a._id.toString().localeCompare(b._id.toString()));
  },

  async create(input: CreateProfessionalLicenseRecordInput, actor: { userId?: string }): Promise<ProfessionalLicenseRecordRow> {
    await connectMongoDB();
    const personId = await personOf(input.employeeId, input.organizationId);
    const professionCode = cleanProfession(input.professionCode);
    const licenseNumber = cleanLicenseNumber(input.licenseNumber);
    const validUntil = cleanValidUntil(input.validUntil);
    await PrcProfessionService.assertValidCode(input.organizationId, professionCode);

    const created = await ProfessionalLicenseRecordModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      personId,
      professionCode,
      licenseNumber,
      ...(validUntil ? { validUntil } : {}),
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "professional-license-record.created",
      resourceType: "ProfessionalLicenseRecord",
      resourceId: created._id.toString(),
      after: snapshot(created),
    });
    return created.toObject() as ProfessionalLicenseRecordRow;
  },

  /** The profession is checked only when it changes, so editing the number on a license whose profession HR retired still works. */
  async update(employeeId: string, recordId: string, organizationId: string, patch: UpdateProfessionalLicenseRecordInput, actor: { userId?: string }): Promise<ProfessionalLicenseRecordRow> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const orgId = new Types.ObjectId(organizationId);
    const existing = await ProfessionalLicenseRecordModel.findOne({ _id: new Types.ObjectId(recordId), organizationId: orgId, personId }).lean<ProfessionalLicenseRecordRow>();
    if (!existing) throw new NotFoundError("PRC license not found for this employee");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (patch.professionCode !== undefined) {
      const professionCode = cleanProfession(patch.professionCode);
      if (professionCode !== existing.professionCode) await PrcProfessionService.assertValidCode(organizationId, professionCode);
      set.professionCode = professionCode;
    }
    if (patch.licenseNumber !== undefined) set.licenseNumber = cleanLicenseNumber(patch.licenseNumber);
    if (patch.validUntil !== undefined) {
      const validUntil = cleanValidUntil(patch.validUntil);
      if (validUntil) set.validUntil = validUntil;
      else unset.validUntil = "";
    }

    const updated = await ProfessionalLicenseRecordModel.findOneAndUpdate(
      { _id: existing._id, organizationId: orgId, personId },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { returnDocument: "after" },
    ).lean<ProfessionalLicenseRecordRow>();
    if (!updated) throw new NotFoundError("PRC license not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "professional-license-record.updated",
      resourceType: "ProfessionalLicenseRecord",
      resourceId: updated._id.toString(),
      before: snapshot(existing),
      after: snapshot(updated),
    });
    return updated;
  },

  async remove(employeeId: string, recordId: string, organizationId: string, actor: { userId?: string }): Promise<void> {
    await connectMongoDB();
    const personId = await personOf(employeeId, organizationId);
    const removed = await ProfessionalLicenseRecordModel.findOneAndDelete({ _id: new Types.ObjectId(recordId), organizationId: new Types.ObjectId(organizationId), personId }).lean<ProfessionalLicenseRecordRow>();
    if (!removed) throw new NotFoundError("PRC license not found for this employee");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "professional-license-record.removed",
      resourceType: "ProfessionalLicenseRecord",
      resourceId: removed._id.toString(),
      before: snapshot(removed),
    });
  },
};
