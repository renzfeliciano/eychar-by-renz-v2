import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { CompensationModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { addDays, dateKeyToDate, dateToDateKey, formatDateKey, localDateKey } from "@/lib/date-key";
import { roundMoney } from "./engine/money";
import { projectsAsOf } from "./payroll-scope";
import type { BulkCompensationChangeInput, CreateCompensationInput, ReviseCompensationInput } from "@/shared/validation/payroll";

type Terms = Omit<ReviseCompensationInput, "organizationId">;
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

function termsSnapshot(row: { rateType: string; rate: number; allowances?: unknown; minimumWageEarner?: boolean }) {
  return { rateType: row.rateType, rate: row.rate, allowances: row.allowances, minimumWageEarner: row.minimumWageEarner };
}

function applyChange(currentRate: number, changeType: BulkCompensationChangeInput["changeType"], value: number): number {
  if (changeType === "set_rate") return roundMoney(value);
  if (changeType === "increase_amount") return roundMoney(currentRate + value);
  if (changeType === "increase_percent") return roundMoney(currentRate * (1 + value / 100));
  return Math.max(currentRate, roundMoney(value));
}

/**
 * Effective-dated pay terms (AGENTS.md §27). Rows are never edited: a
 * revision closes the current terms the day before it starts, so every
 * calendar day resolves exactly one row and past payroll keeps using the
 * terms it was computed with.
 */
export const CompensationService = {
  /** The first pay terms for an employee; after that, use `revise`. */
  async create(input: CreateCompensationInput, actor: { userId?: string }) {
    await connectMongoDB();
    const employeeId = new Types.ObjectId(input.employeeId);
    if (await CompensationModel.exists({ employeeId })) {
      throw new ConflictError("This employee already has pay terms. Revise them instead.");
    }

    const compensation = await CompensationModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      employeeId,
      rateType: input.rateType,
      rate: input.rate,
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
    const employeeObjectId = new Types.ObjectId(employeeId);
    const effectiveKey = terms.effectiveFrom ?? localDateKey();

    const latest = await CompensationModel.findOne({ employeeId: employeeObjectId, organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: -1 });
    if (!latest) throw new NotFoundError("This employee has no pay terms yet. Add them first.");
    const latestStart = dateToDateKey(latest.effectiveFrom);
    if (latestStart >= effectiveKey) {
      throw new ConflictError(`Pay terms already change on ${formatDateKey(latestStart)}. Revise from a later date.`);
    }

    const before = termsSnapshot(latest);
    latest.effectiveTo = dateKeyToDate(addDays(effectiveKey, -1));
    await latest.save();

    const next = await CompensationModel.create({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: employeeObjectId,
      rateType: terms.rateType,
      rate: terms.rate,
      allowances: terms.allowances,
      minimumWageEarner: terms.minimumWageEarner,
      effectiveFrom: dateKeyToDate(effectiveKey),
      reason: terms.reason,
      batchId: options.batchId,
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

  async getAsOf(employeeId: string, dateKey: string) {
    await connectMongoDB();
    const rows = await CompensationModel.find({ employeeId: new Types.ObjectId(employeeId), effectiveFrom: { $lte: dateKeyToDate(dateKey) } })
      .sort({ effectiveFrom: -1 })
      .lean();
    return rows.find((row) => appliesOn(row, dateKey)) ?? null;
  },

  /** Terms per employee as of one day, in one query (for payroll runs and previews). */
  async getAsOfForEmployees(employeeIds: string[], dateKey: string) {
    await connectMongoDB();
    const rows = await CompensationModel.find({
      employeeId: { $in: employeeIds.map((id) => new Types.ObjectId(id)) },
      effectiveFrom: { $lte: dateKeyToDate(dateKey) },
    })
      .sort({ effectiveFrom: 1 })
      .lean();
    const byEmployee = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (appliesOn(row, dateKey)) byEmployee.set(row.employeeId.toString(), row);
    return byEmployee;
  },

  /** Every employee with pay terms: what applies today and the next scheduled change, if any. */
  async listForOrganization(organizationId: string, todayKey: string = localDateKey()) {
    await connectMongoDB();
    const rows = await CompensationModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ effectiveFrom: 1 }).lean();
    const byEmployee = new Map<string, { employeeId: string; current: (typeof rows)[number] | null; upcoming: (typeof rows)[number] | null }>();
    for (const row of rows) {
      const employeeId = row.employeeId.toString();
      const entry = byEmployee.get(employeeId) ?? { employeeId, current: null, upcoming: null };
      if (appliesOn(row, todayKey)) entry.current = row;
      else if (dateToDateKey(row.effectiveFrom) > todayKey && !entry.upcoming) entry.upcoming = row;
      byEmployee.set(employeeId, entry);
    }
    return [...byEmployee.values()];
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
      this.getAsOfForEmployees(employeeIds, input.effectiveFrom),
      CompensationModel.find({ employeeId: { $in: employeeIds.map((id) => new Types.ObjectId(id)) } }).sort({ effectiveFrom: 1 }).lean(),
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

  /** Applies a previewed bulk change as one batch of revisions, keeping each employee's other terms. */
  async applyBulkChange(input: BulkCompensationChangeInput, actor: { userId?: string }) {
    const preview = await this.previewBulkChange(input);
    const picked = input.employeeIds ? new Set(input.employeeIds) : null;
    const toApply = preview.filter((row) => row.status === "change" && (!picked || picked.has(row.employeeId)));
    const batchId = new Types.ObjectId().toString();

    const termsByEmployee = await this.getAsOfForEmployees(
      toApply.map((row) => row.employeeId),
      input.effectiveFrom,
    );
    for (const row of toApply) {
      const current = termsByEmployee.get(row.employeeId)!;
      await this.revise(
        row.employeeId,
        input.organizationId,
        {
          rateType: current.rateType as "monthly" | "daily",
          rate: row.newRate!,
          allowances: current.allowances.map((allowance: { name: string; amount: number; basis: "monthly" | "daily"; taxable: boolean }) => ({ ...allowance })),
          minimumWageEarner: current.minimumWageEarner,
          effectiveFrom: input.effectiveFrom,
          reason: input.reason,
        },
        actor,
        { batchId },
      );
    }

    const skipped = preview.filter((row) => row.status === "skipped").length;
    await AuditService.record({
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

    return { batchId, applied: toApply.length, skipped };
  },
};
