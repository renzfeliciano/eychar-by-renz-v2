import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ShiftTemplateModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { CreateShiftTemplateInput, ShiftKind, UpdateShiftTemplateInput } from "@/shared/validation/schedule";

type ShiftShape = { kind: ShiftKind; startTime?: string | null; endTime?: string | null };

/** A work shift needs a real time span (overnight is fine: 22:00→07:00); a rest day has none. */
function assertShiftShape({ kind, startTime, endTime }: ShiftShape) {
  if (kind === "work") {
    if (!startTime || !endTime) throw new BusinessRuleError("A work shift needs both a start and an end time");
    if (startTime === endTime) throw new BusinessRuleError("A work shift can't start and end at the same time");
  } else if (startTime || endTime) {
    throw new BusinessRuleError("A rest day doesn't have start or end times");
  }
}

function snapshot(shift: { name: string; code: string; kind: string; startTime?: string | null; endTime?: string | null }) {
  return { name: shift.name, code: shift.code, kind: shift.kind, startTime: shift.startTime, endTime: shift.endTime };
}

export const ShiftTemplateService = {
  async create(input: CreateShiftTemplateInput, actor: { userId?: string }) {
    await connectMongoDB();
    assertShiftShape(input);

    let shift;
    try {
      shift = await ShiftTemplateModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        name: input.name,
        code: input.code.toUpperCase(),
        kind: input.kind,
        startTime: input.startTime,
        endTime: input.endTime,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError(`Shift code "${input.code.toUpperCase()}" is already in use`);
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "shift-template.created",
      resourceType: "ShiftTemplate",
      resourceId: shift._id.toString(),
      after: snapshot(shift),
    });

    return shift;
  },

  /** Work shifts in start-time order, then rest days — the order HR scans them in a picker. */
  async listCurrent(organizationId: string) {
    await connectMongoDB();
    const shifts = await ShiftTemplateModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean();
    return shifts.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "work" ? -1 : 1;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.name.localeCompare(b.name);
    });
  },

  /** "" clears a time — how an edit turns a work shift into a rest day. */
  async update(id: string, organizationId: string, patch: Omit<UpdateShiftTemplateInput, "organizationId" | "status">, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Shift not found in this organization");

    const orgObjectId = new Types.ObjectId(organizationId);
    const existing = await ShiftTemplateModel.findOne({ _id: new Types.ObjectId(id), organizationId: orgObjectId });
    if (!existing) throw new NotFoundError("Shift not found in this organization");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === "") unset[key] = "";
      else set[key] = key === "code" ? String(value).toUpperCase() : value;
    }

    assertShiftShape({
      kind: (set.kind as ShiftKind | undefined) ?? existing.kind,
      startTime: "startTime" in unset ? undefined : ((set.startTime as string | undefined) ?? existing.startTime),
      endTime: "endTime" in unset ? undefined : ((set.endTime as string | undefined) ?? existing.endTime),
    });

    let shift;
    try {
      shift = await ShiftTemplateModel.findOneAndUpdate(
        { _id: existing._id, organizationId: orgObjectId },
        { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { returnDocument: "after" },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError(`Shift code "${String(set.code)}" is already in use`);
      throw error;
    }
    if (!shift) throw new NotFoundError("Shift not found in this organization");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "shift-template.updated",
      resourceType: "ShiftTemplate",
      resourceId: shift._id.toString(),
      before: snapshot(existing),
      after: snapshot(shift),
    });

    return shift;
  },

  async updateStatus(id: string, organizationId: string, patch: { status: "active" | "inactive" }, actor: { userId?: string }) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Shift not found in this organization");

    const shift = await ShiftTemplateModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!shift) throw new NotFoundError("Shift not found in this organization");

    const before = { status: shift.status };
    shift.status = patch.status;
    await shift.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "shift-template.updated",
      resourceType: "ShiftTemplate",
      resourceId: shift._id.toString(),
      before,
      after: { status: shift.status },
    });

    return shift;
  },
};
