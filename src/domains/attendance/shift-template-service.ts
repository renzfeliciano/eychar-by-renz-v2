import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ShiftTemplateModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import { nextShiftColor } from "./shift-colors";
import type { CreateShiftTemplateInput, ShiftKind, ShiftPattern, UpdateShiftTemplateInput } from "@/shared/validation/schedule";

type ShiftShape = {
  kind: ShiftKind;
  pattern?: ShiftPattern | null;
  startTime?: string | null;
  endTime?: string | null;
  latestStartTime?: string | null;
  requiredHours?: number | null;
};

/**
 * A fixed work shift needs a real time span (overnight is fine: 22:00→07:00);
 * a flexi one needs a same-day start window and required hours instead of an
 * end; a rest day has no times at all.
 */
function assertShiftShape({ kind, pattern, startTime, endTime, latestStartTime, requiredHours }: ShiftShape) {
  if (kind === "rest") {
    if (startTime || endTime || latestStartTime || requiredHours) throw new BusinessRuleError("A rest day doesn't have start or end times");
    return;
  }
  if (pattern === "flexible") {
    if (!startTime || !latestStartTime) throw new BusinessRuleError("A flexi shift needs the earliest and latest start time");
    if (latestStartTime <= startTime) throw new BusinessRuleError("The latest start must be after the earliest start");
    if (!requiredHours) throw new BusinessRuleError("A flexi shift needs the number of hours to work");
    if (endTime) throw new BusinessRuleError("A flexi shift has no fixed end time");
    return;
  }
  if (!startTime || !endTime) throw new BusinessRuleError("A work shift needs both a start and an end time");
  if (startTime === endTime) throw new BusinessRuleError("A work shift can't start and end at the same time");
  if (latestStartTime || requiredHours) throw new BusinessRuleError("Only a flexi shift has a start window");
}

function snapshot(shift: ShiftShape & { name: string; code: string; color?: string | null }) {
  return {
    name: shift.name,
    code: shift.code,
    kind: shift.kind,
    pattern: shift.pattern,
    color: shift.color,
    startTime: shift.startTime,
    endTime: shift.endTime,
    latestStartTime: shift.latestStartTime,
    requiredHours: shift.requiredHours,
  };
}

export const ShiftTemplateService = {
  async create(input: CreateShiftTemplateInput, actor: { userId?: string }) {
    await connectMongoDB();
    const pattern = input.kind === "work" ? (input.pattern ?? "fixed") : "fixed";
    assertShiftShape({ ...input, pattern });

    const organizationObjectId = new Types.ObjectId(input.organizationId);
    const color =
      input.color ??
      nextShiftColor(
        (await ShiftTemplateModel.find({ organizationId: organizationObjectId }).select("color").lean()).map((shift) => shift.color).filter(Boolean) as string[],
        input.kind,
      );

    let shift;
    try {
      shift = await ShiftTemplateModel.create({
        organizationId: organizationObjectId,
        name: input.name,
        code: input.code.toUpperCase(),
        kind: input.kind,
        pattern,
        color,
        startTime: input.startTime,
        endTime: input.endTime,
        latestStartTime: input.latestStartTime,
        requiredHours: input.requiredHours,
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
    const shifts = await ShiftTemplateModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ createdAt: 1 }).lean();

    // Shifts made before colors existed get their own palette color once, in creation order.
    const uncolored = shifts.filter((shift) => !shift.color);
    if (uncolored.length) {
      const used = shifts.map((shift) => shift.color).filter(Boolean) as string[];
      for (const shift of uncolored) {
        shift.color = nextShiftColor(used, shift.kind as ShiftKind);
        used.push(shift.color);
      }
      await ShiftTemplateModel.bulkWrite(
        uncolored.map((shift) => ({ updateOne: { filter: { _id: shift._id, color: { $exists: false } }, update: { $set: { color: shift.color } } } })),
      );
    }

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

    const resulting = <T,>(key: string, current: T): T | undefined => (key in unset ? undefined : ((set[key] as T | undefined) ?? current));
    assertShiftShape({
      kind: (set.kind as ShiftKind | undefined) ?? existing.kind,
      pattern: resulting<ShiftPattern>("pattern", existing.pattern),
      startTime: resulting<string>("startTime", existing.startTime),
      endTime: resulting<string>("endTime", existing.endTime),
      latestStartTime: resulting<string>("latestStartTime", existing.latestStartTime),
      requiredHours: resulting<number>("requiredHours", existing.requiredHours),
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
