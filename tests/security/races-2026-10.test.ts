import { describe, it, expect, beforeEach, vi } from "vitest";
import mongoose, { Types } from "mongoose";

// Races found in the 2026-10 review: a status read before the transaction,
// then an `_id`-only save inside it, let two competing operations both
// "win" (restore + purge of the same bin entry, two transfers, two
// disbursals). The fix is a conditional update on the status that was
// checked, as the first write of the transaction (ADR-041).
//
// Two kinds of test:
// - "stale read": the competing operation finishes first, then the other
//   one runs from the state it read before (exactly the losing side of the
//   race, made deterministic). Runs on any MongoDB-compatible database.
// - "concurrent": both operations at once with Promise.allSettled, exactly
//   one must win. Needs real MongoDB (single-document atomicity and
//   transactions, as in the MongoMemoryReplSet of tests/global-setup.ts);
//   skipped where transactions aren't supported (the FerretDB container,
//   whose conditional updates also aren't atomic under concurrency).
//
// Where transactions aren't supported, `withTransaction` runs the work
// without a session so the stale-read tests still exercise the guards.
const blob = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: (...args: unknown[]) => blob.del(...args) }));
vi.mock("@/server/db/transaction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db/transaction")>();
  let supported: Promise<boolean> | undefined;
  const probe = () =>
    (supported ??= actual
      .withTransaction(async (session) => {
        await mongoose.connection.db!.collection("transaction_probe").insertOne({ at: new Date() }, { session });
      })
      .then(
        () => true,
        () => false,
      ));
  return {
    ...actual,
    transactionsSupported: probe,
    withTransaction: async <T,>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> =>
      (await probe()) ? actual.withTransaction(work) : work(undefined as unknown as mongoose.ClientSession),
  };
});

const { connectMongoDB } = await import("@/server/db/connection");
const transaction = (await import("@/server/db/transaction")) as unknown as { transactionsSupported: () => Promise<boolean> };
const models = await import("@/server/db/models");
const { SuperAdminService } = await import("@/domains/authorization/super-admin-service");
const { DeletionService } = await import("@/domains/deletion/deletion-service");
const { EmployeeAssignmentService } = await import("@/domains/workforce/employee-assignment-service");
const { FinalSettlementService } = await import("@/domains/final-settlement/final-settlement-service");
const { PaymentMethodService } = await import("@/domains/catalog/payment-method-service");
const { BusinessRuleError, ConflictError } = await import("@/shared/errors");

await connectMongoDB();
const realTransactions = await transaction.transactionsSupported();

const unique = () => `${Date.now()}-${Math.random()}`;

function outcome(results: PromiseSettledResult<unknown>[]) {
  const won = results.filter((result) => result.status === "fulfilled");
  const lost = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  return { won, lost };
}

/** Makes the next `findOne` on `model` return `snapshot`: the state the losing request read before the winner wrote. */
function readsStale(model: { findOne: (...args: never[]) => unknown }, snapshot: unknown) {
  vi.spyOn(model, "findOne").mockReturnValueOnce(snapshot as never);
}

async function seedOrganization() {
  const organization = await models.OrganizationModel.create({ name: "Race Co", slug: `race-${unique()}` });
  return organization._id;
}

async function seedEmployee(organizationId: Types.ObjectId, firstName: string) {
  const person = await models.PersonModel.create({ organizationId, firstName, lastName: "Reyes" });
  const employee = await models.EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${unique()}` });
  return employee._id;
}

describe("Races fixed in 2026-10 (conditional updates inside transactions)", () => {
  beforeEach(async () => {
    await connectMongoDB();
    blob.del.mockClear();
  });

  describe("recycle bin: restore vs purge", () => {
    async function seedBin() {
      const organizationId = await seedOrganization();
      const owner = await models.UserModel.create({ username: `owner.${unique()}`, passwordHash: "x" });
      await SuperAdminService.ensure(organizationId.toString(), owner._id.toString());
      const employeeId = await seedEmployee(organizationId, "Ana");
      const photoKey = `attendance-photos/${organizationId}/${employeeId}/${new Types.ObjectId()}.jpg`;
      await models.AttendanceRecordModel.create({
        organizationId,
        employeeId,
        date: new Date("2026-10-01"),
        status: "present",
        checkIn: { at: new Date("2026-10-01T00:00:00Z"), photoStorage: { provider: "vercel-blob", key: photoKey } },
      });
      const batch = await DeletionService.remove("employee", employeeId.toString(), organizationId.toString(), { confirm: "Ana Reyes" }, { userId: owner._id.toString() });
      return { organizationId: organizationId.toString(), owner: owner._id.toString(), employeeId, batchId: batch._id.toString(), photoKey };
    }
    type Bin = Awaited<ReturnType<typeof seedBin>>;

    const restore = (s: Bin) => DeletionService.restore(s.batchId, s.organizationId, { userId: s.owner });
    const purgeNow = (s: Bin) => DeletionService.purgeNow(s.batchId, s.organizationId, { userId: s.owner });
    const staleBatch = (s: Bin) => models.DeletionBatchModel.findById(s.batchId);

    async function expectConsistent(s: Bin, winner: "restored" | "purged") {
      const batch = await models.DeletionBatchModel.findById(s.batchId).lean();
      expect(batch?.status).toBe(winner);
      expect(await models.DeletedRecordModel.countDocuments({ batchId: batch!._id })).toBe(0);
      const employeeBack = Boolean(await models.EmployeeModel.exists({ _id: s.employeeId }));
      const attendanceBack = await models.AttendanceRecordModel.countDocuments({ employeeId: s.employeeId });
      const audits = await models.AuditLogModel.find({ resourceId: s.employeeId.toString(), action: { $in: ["record.restored", "record.purged"] } }).lean();
      expect(audits.map((audit) => audit.action)).toEqual([winner === "restored" ? "record.restored" : "record.purged"]);
      if (winner === "restored") {
        expect(employeeBack).toBe(true);
        expect(attendanceBack).toBe(1);
        expect(batch?.purgedAt).toBeUndefined();
        expect(blob.del).not.toHaveBeenCalled();
      } else {
        expect(employeeBack).toBe(false);
        expect(attendanceBack).toBe(0);
        expect(batch?.restoredAt).toBeUndefined();
        // Purged for good: the clock photo's blob goes too.
        expect(blob.del).toHaveBeenCalledWith(s.photoKey);
      }
    }

    it("stale read: a purge that read the entry before it was restored doesn't delete it", async () => {
      const s = await seedBin();
      const stale = await staleBatch(s);
      await restore(s);
      readsStale(models.DeletionBatchModel, stale);
      await expect(purgeNow(s)).rejects.toBeInstanceOf(ConflictError);
      await expectConsistent(s, "restored");
    });

    it("stale read: a restore that read the entry before it was purged puts nothing back", async () => {
      const s = await seedBin();
      const stale = await staleBatch(s);
      await purgeNow(s);
      blob.del.mockClear();
      readsStale(models.DeletionBatchModel, stale);
      await expect(restore(s)).rejects.toBeInstanceOf(ConflictError);
      // The losing restore removes no files.
      expect(blob.del).not.toHaveBeenCalled();
      const batch = await models.DeletionBatchModel.findById(s.batchId).lean();
      expect(batch?.status).toBe("purged");
      expect(batch?.restoredAt).toBeUndefined();
      expect(await models.EmployeeModel.exists({ _id: s.employeeId })).toBeNull();
      expect(await models.AttendanceRecordModel.countDocuments({ employeeId: s.employeeId })).toBe(0);
    });

    it("stale read: a second restore of the same entry is refused, not applied twice", async () => {
      const s = await seedBin();
      const stale = await staleBatch(s);
      await restore(s);
      readsStale(models.DeletionBatchModel, stale);
      await expect(restore(s)).rejects.toBeInstanceOf(ConflictError);
      await expectConsistent(s, "restored");
      expect(await models.PersonModel.countDocuments({ organizationId: s.organizationId, firstName: "Ana" })).toBe(1);
    });

    it("purgeExpired skips an entry restored after it was listed", async () => {
      const s = await seedBin();
      await models.DeletionBatchModel.updateOne({ _id: s.batchId }, { $set: { purgeAfter: new Date(Date.now() - 1000) } });
      const listed = await models.DeletionBatchModel.find({ _id: s.batchId });
      await restore(s);
      vi.spyOn(models.DeletionBatchModel, "find").mockReturnValueOnce(listed as never);
      expect(await DeletionService.purgeExpired(s.organizationId)).toBe(0);
      await expectConsistent(s, "restored");
    });

    it.runIf(realTransactions)("concurrent: exactly one of restore and purgeNow wins, never a restored-and-purged mix", async () => {
      for (const order of ["restore-first", "purge-first"] as const) {
        blob.del.mockClear();
        const s = await seedBin();
        const results = await Promise.allSettled(order === "restore-first" ? [restore(s), purgeNow(s)] : [purgeNow(s), restore(s)]);
        const { won, lost } = outcome(results);
        expect(won).toHaveLength(1);
        expect(lost[0].reason).toSatisfy((error: unknown) => error instanceof ConflictError || error instanceof BusinessRuleError);
        const restoreWon = results[order === "restore-first" ? 0 : 1].status === "fulfilled";
        await expectConsistent(s, restoreWon ? "restored" : "purged");
      }
    });

    it.runIf(realTransactions)("concurrent: restore vs purgeExpired", async () => {
      const s = await seedBin();
      await models.DeletionBatchModel.updateOne({ _id: s.batchId }, { $set: { purgeAfter: new Date(Date.now() - 1000) } });
      const results = await Promise.allSettled([restore(s), DeletionService.purgeExpired(s.organizationId)]);
      expect(results[1].status).toBe("fulfilled");
      const restoreWon = results[0].status === "fulfilled";
      expect((results[1] as PromiseFulfilledResult<number>).value).toBe(restoreWon ? 0 : 1);
      await expectConsistent(s, restoreWon ? "restored" : "purged");
    });
  });

  describe("assignment transfer vs transfer", () => {
    async function seedAssignment() {
      const organizationId = await seedOrganization();
      const employeeId = await seedEmployee(organizationId, "Ben");
      const position = await models.PositionModel.create({ organizationId, title: "Foreman", code: `FM-${unique()}` });
      const [home, siteA, siteB] = await Promise.all(
        ["Home", "Site A", "Site B"].map((name) => models.ProjectModel.create({ organizationId, name, code: `${name}-${unique()}` })),
      );
      await models.EmployeeAssignmentModel.create({ organizationId, employeeId, positionId: position._id, projectId: home._id, effectiveFrom: new Date("2026-01-01") });
      const transfer = (projectId: Types.ObjectId) =>
        EmployeeAssignmentService.transfer(employeeId.toString(), organizationId.toString(), { projectId: projectId.toString(), effectiveFrom: new Date("2026-10-01") }, {});
      return { organizationId, employeeId, home, siteA, siteB, transfer };
    }

    async function expectOneOpen(s: Awaited<ReturnType<typeof seedAssignment>>, winner: Types.ObjectId) {
      const all = await models.EmployeeAssignmentModel.find({ employeeId: s.employeeId }).lean();
      const open = all.filter((assignment) => !assignment.effectiveTo);
      expect(all).toHaveLength(2);
      expect(open).toHaveLength(1);
      expect(open[0].projectId?.toString()).toBe(winner.toString());
      const closed = all.find((assignment) => assignment.projectId?.toString() === s.home._id.toString());
      expect(closed?.effectiveTo?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    }

    it("stale read: a transfer that read the old assignment after another closed it fails instead of opening a second", async () => {
      const s = await seedAssignment();
      const stale = await models.EmployeeAssignmentModel.findOne({ employeeId: s.employeeId });
      await s.transfer(s.siteA._id);
      readsStale(models.EmployeeAssignmentModel, stale);
      const error = await s.transfer(s.siteB._id).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe("This employee's assignment was just changed by someone else. Reload and try again.");
      await expectOneOpen(s, s.siteA._id);
    });

    it.runIf(realTransactions)("concurrent: leaves exactly one open assignment when two transfers race", async () => {
      const s = await seedAssignment();
      const results = await Promise.allSettled([s.transfer(s.siteA._id), s.transfer(s.siteB._id)]);
      const { won, lost } = outcome(results);
      expect(won).toHaveLength(1);
      expect(lost[0].reason).toBeInstanceOf(ConflictError);
      await expectOneOpen(s, results[0].status === "fulfilled" ? s.siteA._id : s.siteB._id);
    });
  });

  describe("final settlement transitions", () => {
    async function seedSettlement(status: "approved" | "reviewed" | "draft") {
      const organizationId = await seedOrganization();
      const employeeId = await seedEmployee(organizationId, "Cora");
      await PaymentMethodService.create({ organizationId: organizationId.toString(), code: "bank_transfer", name: "Bank transfer" }, {});
      const clearance = await models.ClearanceCaseModel.create({
        organizationId,
        caseNumber: `CL-${unique()}`,
        employeeId,
        separationTypeCode: "resignation",
        noticeDate: new Date("2026-09-01"),
        lastWorkingDay: new Date("2026-09-30"),
        status: "cleared",
      });
      const settlement = await models.FinalSettlementModel.create({
        organizationId,
        clearanceCaseId: clearance._id,
        employeeId,
        status,
        totals: { earnings: 1000, deductions: 0, net: 1000 },
        history: [{ action: "prepared", at: new Date(), version: 1 }],
      });
      const disburse = (reference: string) =>
        FinalSettlementService.act(settlement._id.toString(), organizationId.toString(), { action: "disburse", paymentMethodCode: "bank_transfer", paymentReference: reference }, {});
      return { organizationId: organizationId.toString(), id: settlement._id.toString(), clearanceId: clearance._id, disburse };
    }

    async function expectDisbursedOnce(s: Awaited<ReturnType<typeof seedSettlement>>, reference: string) {
      const stored = await models.FinalSettlementModel.findById(s.id).lean();
      expect(stored?.status).toBe("disbursed");
      expect(stored?.history.filter((entry) => entry.action === "disbursed")).toHaveLength(1);
      expect(stored?.payment?.reference).toBe(reference);
      expect((await models.ClearanceCaseModel.findById(s.clearanceId).lean())?.status).toBe("closed");
    }

    it("stale read: a second disbursal of an already disbursed settlement is refused and changes nothing", async () => {
      const s = await seedSettlement("approved");
      const stale = await models.FinalSettlementModel.findById(s.id);
      await s.disburse("REF-ONE");
      readsStale(models.FinalSettlementModel, stale);
      await expect(s.disburse("REF-TWO")).rejects.toBeInstanceOf(ConflictError);
      await expectDisbursedOnce(s, "REF-ONE");
    });

    it("stale read: approving a settlement that was just returned to draft is refused", async () => {
      const s = await seedSettlement("reviewed");
      const stale = await models.FinalSettlementModel.findById(s.id);
      await FinalSettlementService.act(s.id, s.organizationId, { action: "return", note: "Recheck leave" }, {});
      readsStale(models.FinalSettlementModel, stale);
      await expect(FinalSettlementService.act(s.id, s.organizationId, { action: "approve" }, {})).rejects.toBeInstanceOf(ConflictError);
      const stored = await models.FinalSettlementModel.findById(s.id).lean();
      expect(stored?.status).toBe("draft");
      expect(stored?.history.map((entry) => entry.action)).toEqual(["prepared", "returned"]);
    });

    it("stale read: lines can't be added to a settlement that left draft after it was read", async () => {
      const s = await seedSettlement("draft");
      const stale = await models.FinalSettlementModel.findById(s.id);
      await models.FinalSettlementModel.updateOne({ _id: s.id }, { $set: { status: "submitted" } });
      readsStale(models.FinalSettlementModel, stale);
      await expect(
        FinalSettlementService.addManualLine(s.id, s.organizationId, { direction: "earning", label: "Bonus", amount: 100, reason: "Promised" }, {}),
      ).rejects.toBeInstanceOf(ConflictError);
      const stored = await models.FinalSettlementModel.findById(s.id).lean();
      expect(stored?.status).toBe("submitted");
      expect(stored?.manualLines).toHaveLength(0);
    });

    it.runIf(realTransactions)("concurrent: disburses once when two people disburse at the same time", async () => {
      const s = await seedSettlement("approved");
      const results = await Promise.allSettled([s.disburse("REF-ONE"), s.disburse("REF-TWO")]);
      const { won, lost } = outcome(results);
      expect(won).toHaveLength(1);
      expect(lost[0].reason).toSatisfy((error: unknown) => error instanceof ConflictError || error instanceof BusinessRuleError);
      await expectDisbursedOnce(s, results[0].status === "fulfilled" ? "REF-ONE" : "REF-TWO");
    });

    it.runIf(realTransactions)("concurrent: only one of approve and return lands on a reviewed settlement", async () => {
      const s = await seedSettlement("reviewed");
      const results = await Promise.allSettled([
        FinalSettlementService.act(s.id, s.organizationId, { action: "approve" }, {}),
        FinalSettlementService.act(s.id, s.organizationId, { action: "return", note: "Recheck leave" }, {}),
      ]);
      expect(outcome(results).won).toHaveLength(1);
      const stored = await models.FinalSettlementModel.findById(s.id).lean();
      expect(stored!.history.filter((entry) => entry.action === "approved" || entry.action === "returned")).toHaveLength(1);
      expect(stored?.status).toBe(results[0].status === "fulfilled" ? "approved" : "draft");
    });
  });
});
