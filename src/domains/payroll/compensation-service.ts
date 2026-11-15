import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { CompensationModel, EmployeeModel, PayrollRecordModel, PayrollRunModel } from "@/server/db/models";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { AuditService, type AuditRecordInput } from "@/server/audit/audit-service";
import { withTransaction } from "@/server/db/transaction";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { addDays, dateKeyToDate, dateToDateKey, formatDateKey, localDateKey } from "@/lib/date-key";
import { roundMoney } from "./engine/money";
import { projectsAsOf } from "./payroll-scope";
import { compensationHistory, compensationTotal } from "./compensation-history";
import type { BulkCompensationChangeInput, CreateCompensationInput, ReviseCompensationInput } from "@/shared/validation/payroll";

/** Pay terms as entered: a basic salary (or daily rate) and an annual increase, or a plain rate (a basic with no increase). The total is always computed here. */
type RateFields = { rate?: number; baseRate?: number; annualIncrease?: number };
type Terms = Omit<ReviseCompensationInput, "organizationId" | keyof RateFields> & RateFields;
type CreateInput = Omit<CreateCompensationInput, keyof RateFields> & RateFields;

/** Payroll runs past draft: pay terms they used are part of what was paid and can't be corrected in place. */
const FINAL_RUN_STATUSES = ["submitted", "approved", "released"];
type CompensationRow = { _id: Types.ObjectId; employeeId: Types.ObjectId; rateType: string; rate: number; effectiveFrom: Date; effectiveTo?: Date | null };

export type BulkPreviewRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  rateType: "monthly" | "daily" | null;
  currentRate: number | null;
  newRate: number | null;
  status: "change" | "unchanged" | "skipped";
  note?: string;
};

function appliesOn<T extends { effectiveFrom: Date; effectiveTo?: Date | null }>(row: T, dateKey: string): boolean {
  return dateToDateKey(row.effectiveFrom) <= dateKey && (!row.effectiveTo || dateToDateKey(row.effectiveTo) >= dateKey);
}

function termsSnapshot(row: { rateType: string; rate: number; baseRate?: number | null; annualIncrease?: number | null; allowances?: unknown; minimumWageEarner?: boolean }) {
  return {
    rateType: row.rateType,
    baseRate: row.baseRate ?? row.rate,
    annualIncrease: row.annualIncrease ?? 0,
    rate: row.rate,
    allowances: row.allowances,
    minimumWageEarner: row.minimumWageEarner,
  };
}

function applyChange(currentRate: number, changeType: BulkCompensationChangeInput["changeType"], value: number): number {
  if (changeType === "set_rate") return roundMoney(value);
  if (changeType === "increase_amount") return roundMoney(currentRate + value);
  if (changeType === "increase_percent") return roundMoney(currentRate * (1 + value / 100));
  return Math.max(currentRate, roundMoney(value));
}

/**
 * Effective-dated pay terms (ENGINEERING.md §27). A revision closes the
 * current terms the day before it starts, so every calendar day resolves
 * exactly one row and past payroll keeps using the terms it was computed
 * with. The one exception is a correction: a revision dated the same day as
 * the latest terms replaces them in place (a typo in a salary just entered),
 * refused once a payroll run past draft has used them.
 */
export const CompensationService = {
  /** The first pay terms for an employee; after that, use `revise`. */
  async create(input: CreateInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");
    const organizationId = new Types.ObjectId(input.organizationId);
    const employeeId = new Types.ObjectId(input.employeeId);
    if (await CompensationModel.exists({ organizationId, employeeId })) {
      throw new ConflictError("This employee already has pay terms. Revise them instead.");
    }

    const compensation = await CompensationModel.create({
      organizationId,
      employeeId,
      rateType: input.rateType,
      ...compensationTotal(input),
      allowances: input.allowances,
      minimumWageEarner: input.minimumWageEarner,
      effectiveFrom: dateKeyToDate(input.effectiveFrom ?? localDateKey()),
      reason: input.reason,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "compensation.created",
      resourceType: "Compensation",
      resourceId: compensation._id.toString(),
      after: termsSnapshot(compensation),
    });

    return compensation;
  },

  async revise(employeeId: string, organizationId: string, terms: Terms, actor: { userId?: string }, options: { batchId?: string } = {}) {
    await connectMongoDB();
    await assertInOrganization(EmployeeModel, employeeId, organizationId, "Employee");
    const employeeObjectId = new Types.ObjectId(employeeId);
    const effectiveKey = terms.effectiveFrom ?? localDateKey();

    const latest = await CompensationModel.findOne({ employeeId: employeeObjectId, organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: -1 });
    if (!latest) throw new NotFoundError("This employee has no pay terms yet. Add them first.");
    const latestStart = dateToDateKey(latest.effectiveFrom);
    if (latestStart > effectiveKey) {
      throw new ConflictError(`Pay terms already change on ${formatDateKey(latestStart)}. Revise from that date or later.`);
    }
    if (latestStart === effectiveKey) return this.correct(latest, organizationId, terms, actor);

    const before = termsSnapshot(latest);
    // Close and open together (ADR-041): a failure between the two writes must
    // not leave the employee with closed terms and nothing after them, which
    // would silently drop them from the next payroll run.
    const next = await withTransaction(async (session) => {
      await CompensationModel.updateOne({ _id: latest._id }, { $set: { effectiveTo: dateKeyToDate(addDays(effectiveKey, -1)) } }, { session });
      const [created] = await CompensationModel.create(
        [
          {
            organizationId: new Types.ObjectId(organizationId),
            employeeId: employeeObjectId,
            rateType: terms.rateType,
            ...compensationTotal(terms),
            allowances: terms.allowances,
            minimumWageEarner: terms.minimumWageEarner,
            effectiveFrom: dateKeyToDate(effectiveKey),
            reason: terms.reason,
            batchId: options.batchId,
          },
        ],
        { session },
      );
      return created;
    });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "compensation.revised",
      resourceType: "Compensation",
      resourceId: next._id.toString(),
      before,
      after: termsSnapshot(next),
      metadata: { effectiveFrom: effectiveKey, reason: terms.reason, batchId: options.batchId },
    });

    return next;
  },

  /** Replaces the latest terms in place, on their own start date. Called by `revise`. */
  async correct(latest: { _id: Types.ObjectId; rateType: string; rate: number; baseRate?: number | null; annualIncrease?: number | null; allowances?: unknown; minimumWageEarner?: boolean; effectiveFrom: Date }, organizationId: string, terms: Terms, actor: { userId?: string }) {
    const runIds = await PayrollRecordModel.distinct("payrollRunId", { compensationId: latest._id });
    if (runIds.length && (await PayrollRunModel.exists({ _id: { $in: runIds }, status: { $in: FINAL_RUN_STATUSES } }))) {
      throw new ConflictError(
        `These pay terms are already used by payroll that was submitted or approved, so they can't be corrected. Enter the change from a later date instead.`,
      );
    }

    const before = termsSnapshot(latest);
    const corrected = await CompensationModel.findOneAndUpdate(
      { _id: latest._id },
      {
        $set: {
          rateType: terms.rateType,
          ...compensationTotal(terms),
          allowances: terms.allowances,
          minimumWageEarner: terms.minimumWageEarner,
          reason: terms.reason,
        },
      },
      { new: true },
    );
    if (!corrected) throw new NotFoundError("These pay terms no longer exist. Reload and try again.");

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "compensation.corrected",
      resourceType: "Compensation",
      resourceId: corrected._id.toString(),
      before,
      after: termsSnapshot(corrected),
      metadata: { effectiveFrom: dateToDateKey(latest.effectiveFrom), reason: terms.reason },
    });
    return corrected;
  },

  async getAsOf(employeeId: string, organizationId: string, dateKey: string) {
    await connectMongoDB();
    if (!Types.ObjectId.isValid(employeeId)) return null;
    const rows = await CompensationModel.find({ organizationId: new Types.ObjectId(organizationId), employeeId: new Types.ObjectId(employeeId), effectiveFrom: { $lte: dateKeyToDate(dateKey) } })
      .sort({ effectiveFrom: -1 })
      .lean();
    return rows.find((row) => appliesOn(row, dateKey)) ?? null;
  },

  /** Terms per employee as of one day, in one query (for payroll runs and previews). */
  async getAsOfForEmployees(employeeIds: string[], organizationId: string, dateKey: string) {
    await connectMongoDB();
    const rows = await CompensationModel.find({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: { $in: employeeIds.map((id) => new Types.ObjectId(id)) },
      effectiveFrom: { $lte: dateKeyToDate(dateKey) },
    })
      .sort({ effectiveFrom: 1 })
      .lean();
    const byEmployee = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (appliesOn(row, dateKey)) byEmployee.set(row.employeeId.toString(), row);
    return byEmployee;
  },

  /** Every employee with pay terms: what applies today, the next scheduled change if any, the latest terms, and the full history. */
  async listForOrganization(organizationId: string, todayKey: string = localDateKey()) {
    await connectMongoDB();
    const rows = await CompensationModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: 1 }).lean();
    type Row = (typeof rows)[number];
    const byEmployee = new Map<string, { employeeId: string; current: Row | null; upcoming: Row | null; latest: Row; rows: Row[] }>();
    for (const row of rows) {
      const employeeId = row.employeeId.toString();
      const entry = byEmployee.get(employeeId) ?? { employeeId, current: null, upcoming: null, latest: row, rows: [] as Row[] };
      if (appliesOn(row, todayKey)) entry.current = row;
      else if (dateToDateKey(row.effectiveFrom) > todayKey && !entry.upcoming) entry.upcoming = row;
      entry.latest = row;
      entry.rows.push(row);
      byEmployee.set(employeeId, entry);
    }
    return [...byEmployee.values()].map(({ rows: employeeRows, ...entry }) => ({ ...entry, history: compensationHistory(employeeRows) }));
  },

  async listHistory(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return CompensationModel.find({ employeeId: new Types.ObjectId(employeeId), organizationId: new Types.ObjectId(organizationId) })
      .sort({ effectiveFrom: -1 })
      .lean();
  },

  /**
   * What a bulk change (e.g. a regional wage order) would do, per employee,
   * without writing anything. Covers current staff, optionally only one
   * project's (as assigned on the effective date) and one rate type.
   * Employees without pay terms, or with a change already dated on or
   * after the effective date, are listed as skipped.
   */
  async previewBulkChange(input: Omit<BulkCompensationChangeInput, "employeeIds">): Promise<BulkPreviewRow[]> {
    await connectMongoDB();
    const [roster, isCurrentStaff] = await Promise.all([EmployeeService.listWithCurrentStatus(input.organizationId), loadCurrentStaffCheck(input.organizationId)]);
    let employees = roster.filter((row) => isCurrentStaff(row.currentEmployment?.status));
    if (input.projectId) {
      const projectByEmployee = await projectsAsOf(employees.map((row) => row._id.toString()), input.effectiveFrom);
      employees = employees.filter((row) => projectByEmployee.get(row._id.toString()) === input.projectId);
    }

    const employeeIds = employees.map((row) => row._id.toString());
    const [termsByEmployee, latestRows] = await Promise.all([
      this.getAsOfForEmployees(employeeIds, input.organizationId, input.effectiveFrom),
      CompensationModel.find({ organizationId: new Types.ObjectId(input.organizationId), employeeId: { $in: employeeIds.map((id) => new Types.ObjectId(id)) } }).sort({ effectiveFrom: 1 }).lean(),
    ]);
    const latestStartByEmployee = new Map<string, string>();
    for (const row of latestRows as CompensationRow[]) latestStartByEmployee.set(row.employeeId.toString(), dateToDateKey(row.effectiveFrom));

    const rows: BulkPreviewRow[] = [];
    for (const employee of employees) {
      const employeeId = employee._id.toString();
      const base = { employeeId, employeeNumber: employee.employeeNumber, name: formatPersonName(employee.person) };
      const terms = termsByEmployee.get(employeeId);
      if (!terms) {
        rows.push({ ...base, rateType: null, currentRate: null, newRate: null, status: "skipped", note: "No pay terms yet" });
        continue;
      }
      const rateType = terms.rateType as "monthly" | "daily";
      if (input.rateType && rateType !== input.rateType) continue;
      const latestStart = latestStartByEmployee.get(employeeId)!;
      if (latestStart >= input.effectiveFrom) {
        rows.push({ ...base, rateType, currentRate: terms.rate, newRate: null, status: "skipped", note: `Already changes on ${formatDateKey(latestStart)}` });
        continue;
      }
      const newRate = applyChange(terms.rate, input.changeType, input.value);
      rows.push({ ...base, rateType, currentRate: terms.rate, newRate, status: newRate === terms.rate ? "unchanged" : "change" });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Applies a previewed bulk change as one batch of revisions, keeping each
   * employee's other terms. Each revision is what `revise` would write
   * (close the latest terms the day before, open new ones, one audit entry
   * each), but read in one query, written in two, and audited in one insert,
   * instead of five round trips per employee. The closes and opens commit
   * together (ADR-041): a failure part way can't leave anyone with closed
   * terms and nothing after them.
   */
  async applyBulkChange(input: BulkCompensationChangeInput, actor: { userId?: string }) {
    const preview = await this.previewBulkChange(input);
    const picked = input.employeeIds ? new Set(input.employeeIds) : null;
    const toApply = preview.filter((row) => row.status === "change" && (!picked || picked.has(row.employeeId)));
    const batchId = new Types.ObjectId().toString();
    const organizationId = new Types.ObjectId(input.organizationId);
    const effectiveKey = input.effectiveFrom;

    // Every row of the employees being changed, oldest first: the terms that
    // apply on the effective date (getAsOfForEmployees' rule) and the latest
    // row (the one `revise` closes).
    type Row = CompensationRow & { allowances: { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean }[]; minimumWageEarner: boolean };
    const rows = toApply.length
      ? await CompensationModel.find({ organizationId, employeeId: { $in: toApply.map((row) => new Types.ObjectId(row.employeeId)) } })
          .sort({ effectiveFrom: 1 })
          .lean<Row[]>()
      : [];
    const currentByEmployee = new Map<string, Row>();
    const latestByEmployee = new Map<string, Row>();
    for (const row of rows) {
      const employeeId = row.employeeId.toString();
      if (appliesOn(row, effectiveKey)) currentByEmployee.set(employeeId, row);
      latestByEmployee.set(employeeId, row);
    }

    // revise()'s checks, for everyone, before anything is written.
    const revisions = toApply.map((row) => {
      const current = currentByEmployee.get(row.employeeId)!;
      const latest = latestByEmployee.get(row.employeeId);
      if (!latest) throw new NotFoundError("This employee has no pay terms yet. Add them first.");
      const latestStart = dateToDateKey(latest.effectiveFrom);
      if (latestStart >= effectiveKey) {
        throw new ConflictError(`Pay terms already change on ${formatDateKey(latestStart)}. Revise from a later date.`);
      }
      return {
        latest,
        next: {
          _id: new Types.ObjectId(),
          organizationId,
          employeeId: new Types.ObjectId(row.employeeId),
          rateType: current.rateType as "monthly" | "daily",
          // A bulk change (a wage order) sets the new rate as the basic, with no increase of its own.
          ...compensationTotal({ baseRate: row.newRate! }),
          allowances: current.allowances.map((allowance) => ({ ...allowance })),
          minimumWageEarner: current.minimumWageEarner,
          effectiveFrom: dateKeyToDate(effectiveKey),
          reason: input.reason,
          batchId,
        },
      };
    });

    const closeOn = dateKeyToDate(addDays(effectiveKey, -1));
    const created = revisions.length
      ? await withTransaction(async (session) => {
          await CompensationModel.bulkWrite(
            revisions.map(({ latest }) => ({ updateOne: { filter: { _id: latest._id }, update: { $set: { effectiveTo: closeOn } } } })),
            { session },
          );
          return CompensationModel.insertMany(
            revisions.map(({ next }) => next),
            { session },
          );
        })
      : [];
    const createdById = new Map(created.map((doc) => [doc._id.toString(), doc]));

    const skipped = preview.filter((row) => row.status === "skipped").length;
    const entries: AuditRecordInput[] = revisions.map(({ latest, next }) => {
      const saved = createdById.get(next._id.toString()) ?? next;
      return {
        organizationId: input.organizationId,
        actorUserId: actor.userId,
        action: "compensation.revised",
        resourceType: "Compensation",
        resourceId: next._id.toString(),
        before: termsSnapshot(latest),
        after: termsSnapshot(saved),
        metadata: { effectiveFrom: effectiveKey, reason: input.reason, batchId },
      };
    });
    entries.push({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "compensation.bulk-changed",
      resourceType: "Compensation",
      resourceId: batchId,
      after: { applied: toApply.length },
      metadata: {
        batchId,
        applied: toApply.length,
        skipped,
        changeType: input.changeType,
        value: input.value,
        effectiveFrom: input.effectiveFrom,
        projectId: input.projectId,
        rateType: input.rateType,
        reason: input.reason,
      },
    });
    await AuditService.recordMany(entries);

    return { batchId, applied: toApply.length, skipped };
  },
};
