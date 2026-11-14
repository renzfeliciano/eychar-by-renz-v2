import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ClearanceCaseModel, EmployeeModel, EmploymentModel, FinalSettlementModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { requiresEndOfContract } from "./contract-terms";
import { localDateKey } from "@/lib/date-key";

export type CreateEmploymentInput = {
  organizationId: string;
  employeeId: string;
  employmentType: string;
  effectiveFrom?: Date;
  endOfContract?: Date;
};

export type ChangeEmploymentTermsInput = {
  employmentType: string;
  /** The day the new terms apply (e.g. the regularization date). */
  effectiveFrom: Date;
  endOfContract?: Date;
  note?: string;
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export type EndingHistoryAction = "ended" | "ending_corrected" | "reinstated";

function endingEntry(action: EndingHistoryAction, status: string, effectiveTo: Date | undefined, reason: string | undefined, actor: { userId?: string }) {
  return {
    action,
    status,
    effectiveTo,
    reason: reason || undefined,
    changedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
    changedAt: new Date(),
  };
}

/**
 * The checks every ending shares (End employment and Edit ending): the status must be valid and not
 * an active-headcount one, and the last day can't be in the future or before the hire date. Only an
 * explicit active flag refuses a status: an unflagged item keeps the old behaviour (see isActiveStatus).
 */
async function assertEndingFields(organizationId: string, employment: { effectiveFrom: Date }, patch: { status?: string; effectiveTo?: Date }) {
  if (patch.status !== undefined) {
    await EmploymentStatusService.assertValidCode(organizationId, patch.status);
    const item = await EmploymentStatusService.getByCode(organizationId, patch.status);
    const metadata = item?.metadata as Record<string, unknown> | undefined;
    if (metadata?.isActiveHeadcount === true) {
      throw new BusinessRuleError(`"${item?.name ?? patch.status}" is an active status. Choose a reason that ends employment, such as Resigned or Terminated.`);
    }
  }
  // The status flips now, so a future end date would drop the employee from current staff early.
  // Until scheduled endings exist, end it on the last working day.
  if (patch.effectiveTo) {
    if (dayKey(patch.effectiveTo) > localDateKey()) {
      throw new BusinessRuleError("The end date can't be in the future yet. End the employment on the last working day.");
    }
    if (dayKey(patch.effectiveTo) < dayKey(employment.effectiveFrom)) {
      throw new BusinessRuleError("The end date can't be before the employee was hired.");
    }
  }
}

// The messages the actions throw, also read by getEndingState so the screens say what the server would say.
const LAST_DAY_LOCKED_MESSAGE = "The last day can't change: a final settlement was already prepared from it. Cancel the settlement first.";
const PAID_OUT_MESSAGE = "Final pay was already paid out, so this employment can't be reinstated.";
const CLEARANCE_OPEN_MESSAGE = "A clearance is still open for this employee. Cancel it first, then reinstate.";

/** A clearance case still in progress for this employee: reinstating would leave offboarding running for an active employee. */
async function clearanceOpen(organizationId: string, employeeId: string): Promise<boolean> {
  return Boolean(await ClearanceCaseModel.exists({ organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId), active: true }));
}

/** A final settlement for this employee made on or after the employment began (an earlier stint's doesn't count). */
async function settlementSince(organizationId: string, employeeId: string, since: Date, status: Record<string, unknown>): Promise<boolean> {
  return Boolean(
    await FinalSettlementModel.exists({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: new Types.ObjectId(employeeId),
      createdAt: { $gte: since },
      status,
    }),
  );
}

/** The employee's latest employment in this organization: the only one an ending can be corrected or reversed on. */
async function latestEmployment(employeeId: string, organizationId: string) {
  const employment = await EmploymentModel.findOne({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: -1 });
  if (!employment) throw new NotFoundError("This employee has no employment record in this organization");
  return employment;
}

const OPEN_EMPLOYMENT_FILTER = {
  $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }],
};

export const EmploymentService = {
  async create(input: CreateEmploymentInput, actor: { userId?: string }) {
    await connectMongoDB();

    const employeeObjectId = new Types.ObjectId(input.employeeId);
    const employeeExists = await EmployeeModel.exists({
      _id: employeeObjectId,
      organizationId: new Types.ObjectId(input.organizationId),
    });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");

    const alreadyOpen = await EmploymentModel.exists({ employeeId: employeeObjectId, ...OPEN_EMPLOYMENT_FILTER });
    if (alreadyOpen) {
      throw new BusinessRuleError("This employee already has an open employment record");
    }

    await EmploymentTypeService.assertValidCode(input.organizationId, input.employmentType);

    const typeItem = await EmploymentTypeService.getByCode(input.organizationId, input.employmentType);
    if (requiresEndOfContract(typeItem) && !input.endOfContract) {
      throw new BusinessRuleError(`End of contract is required for employment type "${input.employmentType}"`);
    }

    const employment = await EmploymentModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId: employeeObjectId,
      employmentType: input.employmentType,
      status: "active",
      effectiveFrom: input.effectiveFrom ?? new Date(),
      endOfContract: input.endOfContract,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "employment.created",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      after: { employmentType: employment.employmentType, status: employment.status },
    });

    return employment;
  },

  async terminate(
    id: string,
    organizationId: string,
    patch: { effectiveTo?: Date; terminationReason?: string; status?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const employment = await EmploymentModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!employment) throw new NotFoundError("Employment record not found in this organization");
    if (!(await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employment record has already ended");
    }

    // Defaults to the original literal "terminated" for callers that don't
    // pick a specific reason — an org can also configure "resigned"/"awol"
    // etc. via Settings > Catalogs and pass one of those codes instead.
    const nextStatus = patch.status ?? "terminated";
    await assertEndingFields(organizationId, employment, { status: nextStatus, effectiveTo: patch.effectiveTo });

    const before = { status: employment.status, effectiveTo: employment.effectiveTo };
    employment.status = nextStatus;
    employment.effectiveTo = patch.effectiveTo ?? new Date();
    if (patch.terminationReason) employment.terminationReason = patch.terminationReason;
    employment.endingHistory.push(endingEntry("ended", nextStatus, employment.effectiveTo, patch.terminationReason, actor));
    await employment.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.terminated",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      before,
      after: { status: employment.status, effectiveTo: employment.effectiveTo, terminationReason: employment.terminationReason },
    });

    return employment;
  },

  /**
   * Corrects how an employment ended: the reason, the last day or the note, in place, so the person
   * is never shown as active in between (Terminated recorded for what was really a resignation).
   * Works on the employee's latest employment once it has ended. The last day is locked once a final
   * settlement was prepared from it; the reason and note never are. Appends to endingHistory.
   */
  async correctEnding(
    employeeId: string,
    organizationId: string,
    patch: { status?: string; effectiveTo?: Date; terminationReason?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();
    const employment = await latestEmployment(employeeId, organizationId);
    if (!employment.effectiveTo || (await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employee's employment hasn't ended, so there is nothing to correct.");
    }

    const statusChanged = patch.status !== undefined && patch.status !== employment.status;
    const lastDayChanged = patch.effectiveTo !== undefined && dayKey(patch.effectiveTo) !== dayKey(employment.effectiveTo);
    const noteChanged = patch.terminationReason !== undefined && patch.terminationReason !== (employment.terminationReason ?? "");
    if (!statusChanged && !lastDayChanged && !noteChanged) throw new BusinessRuleError("Nothing changed: pick a different reason, last day or note.");

    // Only what is actually changing is checked. The dialog re-sends the reason and last day it opened with, and the
    // current reason may since have been retired in the catalog: that must not block a change to the note or the day.
    await assertEndingFields(organizationId, employment, {
      status: statusChanged ? patch.status : undefined,
      effectiveTo: lastDayChanged ? patch.effectiveTo : undefined,
    });

    if (lastDayChanged && (await settlementSince(organizationId, employeeId, employment.effectiveFrom, { $ne: "cancelled" }))) {
      throw new BusinessRuleError(LAST_DAY_LOCKED_MESSAGE);
    }

    const before = { status: employment.status, effectiveTo: employment.effectiveTo, terminationReason: employment.terminationReason };
    const nextStatus = statusChanged ? patch.status! : employment.status;
    const nextEnd = lastDayChanged ? patch.effectiveTo! : employment.effectiveTo;
    const nextNote = noteChanged ? patch.terminationReason : employment.terminationReason;

    const set: Record<string, unknown> = { status: nextStatus, effectiveTo: nextEnd };
    if (nextNote) set.terminationReason = nextNote;
    const updated = await EmploymentModel.findOneAndUpdate(
      { _id: employment._id, organizationId: new Types.ObjectId(organizationId), effectiveTo: { $type: "date" } },
      { $set: set, ...(nextNote ? {} : { $unset: { terminationReason: "" } }), $push: { endingHistory: endingEntry("ending_corrected", nextStatus, nextEnd, nextNote, actor) } },
      { returnDocument: "after" },
    );
    if (!updated) throw new BusinessRuleError("This employee's employment hasn't ended, so there is nothing to correct.");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.ending_corrected",
      resourceType: "Employment",
      resourceId: updated._id.toString(),
      before,
      after: { status: updated.status, effectiveTo: updated.effectiveTo, terminationReason: updated.terminationReason },
    });

    return updated;
  },

  /**
   * Reverses an ending that was wrong: reopens the SAME employment (status Active, no end date), so the
   * hire date and length of service continue. A reason is required and kept in endingHistory. Refused when
   * nothing has ended, when final pay was already paid out, or while a clearance is open. A genuine return
   * after leaving is a rehire (a new employment), not this. Assignment, leave and any account were never
   * changed by ending, so nothing needs restoring.
   */
  async reinstate(employeeId: string, organizationId: string, input: { reason: string }, actor: { userId?: string }) {
    await connectMongoDB();
    const employment = await latestEmployment(employeeId, organizationId);
    if (!employment.effectiveTo || (await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employee's employment hasn't ended, so there is nothing to reinstate.");
    }
    const reason = input.reason.trim();
    if (!reason) throw new BusinessRuleError("Enter why the employment is being reinstated.");
    if (await settlementSince(organizationId, employeeId, employment.effectiveFrom, { $eq: "disbursed" })) throw new BusinessRuleError(PAID_OUT_MESSAGE);
    if (await clearanceOpen(organizationId, employeeId)) throw new BusinessRuleError(CLEARANCE_OPEN_MESSAGE);

    const before = { status: employment.status, effectiveTo: employment.effectiveTo, terminationReason: employment.terminationReason };
    // One conditional update: a second, simultaneous reinstate finds nothing ended and is refused, so no duplicate history.
    const updated = await EmploymentModel.findOneAndUpdate(
      { _id: employment._id, organizationId: new Types.ObjectId(organizationId), effectiveTo: { $type: "date" } },
      { $set: { status: "active" }, $unset: { effectiveTo: "", terminationReason: "" }, $push: { endingHistory: endingEntry("reinstated", "active", undefined, reason, actor) } },
      { returnDocument: "after" },
    );
    if (!updated) throw new BusinessRuleError("This employee's employment hasn't ended, so there is nothing to reinstate.");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.reinstated",
      resourceType: "Employment",
      resourceId: updated._id.toString(),
      before,
      after: { status: updated.status, reason },
    });

    return updated;
  },

  /**
   * What the profile needs to show Edit ending and Reinstate honestly: whether the latest employment has ended,
   * and the reason (the same message the action would throw) when reinstating is blocked or the last day is locked.
   */
  async getEndingState(employeeId: string, organizationId: string): Promise<{ ended: boolean; reinstateBlockedReason: string | null; lastDayLockedReason: string | null }> {
    await connectMongoDB();
    const employment = await latestEmployment(employeeId, organizationId);
    const ended = Boolean(employment.effectiveTo) && !(await EmploymentService.isActiveStatus(organizationId, employment.status));
    if (!ended) return { ended: false, reinstateBlockedReason: null, lastDayLockedReason: null };

    const [disbursed, prepared, clearance] = await Promise.all([
      settlementSince(organizationId, employeeId, employment.effectiveFrom, { $eq: "disbursed" }),
      settlementSince(organizationId, employeeId, employment.effectiveFrom, { $ne: "cancelled" }),
      clearanceOpen(organizationId, employeeId),
    ]);
    return {
      ended: true,
      reinstateBlockedReason: disbursed ? PAID_OUT_MESSAGE : clearance ? CLEARANCE_OPEN_MESSAGE : null,
      lastDayLockedReason: prepared ? LAST_DAY_LOCKED_MESSAGE : null,
    };
  },

  /**
   * Changes the terms of an employee's current employment: a probationary
   * employee made regular, a contract renewed to a new end date, a move
   * between types. The same employment continues (hire date and length of
   * service are kept); the change is appended to `termsHistory` and audited
   * (ADR-052). Types without an end date clear any end date left over.
   */
  async changeTerms(employeeId: string, organizationId: string, input: ChangeEmploymentTermsInput, actor: { userId?: string }) {
    await connectMongoDB();

    const employment = await EmploymentModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
      ...OPEN_EMPLOYMENT_FILTER,
    }).sort({ effectiveFrom: -1 });
    if (!employment) throw new NotFoundError("This employee has no current employment to change");
    if (!(await EmploymentService.isActiveStatus(organizationId, employment.status))) {
      throw new BusinessRuleError("This employment has already ended");
    }

    await EmploymentTypeService.assertValidCode(organizationId, input.employmentType);
    const typeItem = await EmploymentTypeService.getByCode(organizationId, input.employmentType);
    const needsEnd = requiresEndOfContract(typeItem);
    if (needsEnd && !input.endOfContract) throw new BusinessRuleError(`Enter when the contract ends: "${typeItem?.name ?? input.employmentType}" needs an end of contract`);

    const effectiveKey = dayKey(input.effectiveFrom);
    if (effectiveKey < dayKey(employment.effectiveFrom)) throw new BusinessRuleError("The change can't take effect before the employee was hired");
    const endOfContract = needsEnd ? input.endOfContract : undefined;
    if (endOfContract && dayKey(endOfContract) < effectiveKey) throw new BusinessRuleError("The contract can't end before the change takes effect");

    const before = { employmentType: employment.employmentType, endOfContract: employment.endOfContract ?? null };
    const sameEnd = (before.endOfContract ? dayKey(before.endOfContract) : null) === (endOfContract ? dayKey(endOfContract) : null);
    if (before.employmentType === input.employmentType && sameEnd) throw new BusinessRuleError("Nothing changed: pick a different type or end date");

    const note = input.note?.trim() || undefined;
    employment.termsHistory.push({
      employmentType: input.employmentType,
      endOfContract,
      effectiveFrom: input.effectiveFrom,
      previousEmploymentType: before.employmentType,
      previousEndOfContract: before.endOfContract ?? undefined,
      note,
      changedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
      changedAt: new Date(),
    });
    employment.employmentType = input.employmentType;
    employment.endOfContract = endOfContract;
    await employment.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "employment.terms_changed",
      resourceType: "Employment",
      resourceId: employment._id.toString(),
      before,
      after: { employmentType: employment.employmentType, endOfContract: employment.endOfContract ?? null, effectiveFrom: input.effectiveFrom, note },
    });

    return employment;
  },

  async getCurrent(employeeId: string) {
    await connectMongoDB();
    return EmploymentModel.findOne({ employeeId: new Types.ObjectId(employeeId), ...OPEN_EMPLOYMENT_FILTER })
      .sort({ effectiveFrom: -1 })
      .lean();
  },

  /**
   * Generalizes the old literal `status !== "terminated"` check: if the
   * organization has configured "employment-status" catalog items, this
   * reads the matching item's `metadata.isActiveHeadcount`. If no item
   * matches (catalog unconfigured, or a code predating any configuration),
   * it falls back to the original literal rule — so behavior for orgs that
   * never touch Settings > Catalogs is unchanged.
   */
  async isActiveStatus(organizationId: string, status: string): Promise<boolean> {
    const item = await EmploymentStatusService.getByCode(organizationId, status);
    if (item?.metadata && typeof item.metadata === "object" && "isActiveHeadcount" in item.metadata) {
      return Boolean((item.metadata as Record<string, unknown>).isActiveHeadcount);
    }
    return status !== "terminated";
  },
};
