import mongoose, { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, DeletedRecordModel, DeletionBatchModel, EmployeeDocumentModel } from "@/server/db/models";
import { withTransaction, type ClientSession } from "@/server/db/transaction";
import { DocumentStorage } from "@/server/storage/document-storage";
import { AttendancePhotoStorage } from "@/server/storage/attendance-photo-storage";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { AuthorizationError, BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { DELETABLE_TYPES, type DeletableType, type DeletionPlan } from "./deletion-registry";

type Actor = { userId?: string };

/** Days a deleted record stays restorable before it's purged for good. */
export const RECYCLE_BIN_DAYS = 30;

async function loadPlan(type: DeletableType, id: string, organizationId: string): Promise<DeletionPlan> {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Record not found in this organization");
  const plan = await DELETABLE_TYPES[type].plan(new Types.ObjectId(organizationId), new Types.ObjectId(id));
  if (!plan) throw new NotFoundError("Record not found in this organization");
  return plan;
}

async function assertSuperAdmin(actor: Actor, organizationId: string) {
  if (!(await SuperAdminService.isSuperAdmin(actor.userId, organizationId))) throw new AuthorizationError("Only the Super Administrator can delete, restore or purge records");
}

function db() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("Database not connected");
  return database;
}

/**
 * Safe delete with a recycle bin (ADR-033), for the Super Administrator
 * only: preview what goes, type the name to confirm, and everything is
 * moved (not destroyed) so it can be restored for 30 days, then purged.
 */
export const DeletionService = {
  async preview(type: DeletableType, id: string, organizationId: string) {
    const plan = await loadPlan(type, id, organizationId);
    const summary: { label: string; count: number }[] = [];
    for (const step of [...plan.deletes, ...plan.patches]) {
      const count = await step.model.countDocuments(step.filter);
      if (count) summary.push({ label: step.label, count });
    }
    return { label: plan.label, noun: DELETABLE_TYPES[type].noun, summary, blockers: plan.blockers };
  },

  async remove(type: DeletableType, id: string, organizationId: string, input: { confirm: string }, actor: Actor) {
    await assertSuperAdmin(actor, organizationId);
    const plan = await loadPlan(type, id, organizationId);
    if (type === "staff-account" && actor.userId === id) plan.blockers.push("You can't delete your own account");
    if (plan.blockers.length) throw new BusinessRuleError(`Can't delete: ${plan.blockers.join("; ")}`);
    if (input.confirm.trim() !== plan.label) throw new ValidationError(`Type "${plan.label}" exactly to confirm`);

    const orgObjectId = new Types.ObjectId(organizationId);
    // Moving everything into the bin is one change (ADR-041): a failure part
    // way leaves the records where they were, not half in the bin.
    const batch = await withTransaction(async (session) => {
      const [created] = await DeletionBatchModel.create(
        [
          {
            organizationId: orgObjectId,
            entityType: type,
            entityId: id,
            label: plan.label,
            deletedBy: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
            purgeAfter: new Date(Date.now() + RECYCLE_BIN_DAYS * 86_400_000),
          },
        ],
        { session },
      );

      const summary: { label: string; count: number }[] = [];
      let recordCount = 0;
      for (const step of plan.deletes) {
        const docs = await step.model.collection.find(step.filter, { session }).toArray();
        if (!docs.length) continue;
        await DeletedRecordModel.collection.insertMany(
          docs.map((doc) => ({ batchId: created._id, organizationId: orgObjectId, collectionName: step.model.collection.collectionName, doc, createdAt: new Date() })),
          { session },
        );
        await step.model.collection.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } }, { session });
        summary.push({ label: step.label, count: docs.length });
        recordCount += docs.length;
      }
      const patches: { collectionName: string; documentId: unknown; op: string; field: string; value: unknown }[] = [];
      for (const step of plan.patches) {
        const docs = await step.model.collection.find(step.filter, { session }).project({ _id: 1, [step.field]: 1 }).toArray();
        if (!docs.length) continue;
        for (const doc of docs) {
          patches.push({ collectionName: step.model.collection.collectionName, documentId: doc._id, op: step.op, field: step.field, value: step.op === "pull" ? step.value : doc[step.field] });
        }
        const ids = docs.map((doc) => doc._id);
        await step.model.collection.updateMany({ _id: { $in: ids } }, (step.op === "pull" ? { $pull: { [step.field]: step.value } } : { $unset: { [step.field]: "" } }) as never, { session });
        summary.push({ label: step.label, count: docs.length });
      }

      created.set({ summary, recordCount, patches });
      await created.save({ session });
      return created;
    });
    const summary = batch.summary;
    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "record.deleted",
      resourceType: type,
      resourceId: id,
      after: { label: plan.label, recycleBinId: batch._id.toString(), summary, purgeAfter: batch.purgeAfter },
    });
    return batch;
  },

  async restore(batchId: string, organizationId: string, actor: Actor) {
    await assertSuperAdmin(actor, organizationId);
    const batch = await requireBatch(batchId, organizationId);
    if (batch.status !== "in_bin") throw new BusinessRuleError(batch.status === "purged" ? "This was purged for good and can't be restored" : "This was already restored");

    const restoredAt = new Date();
    const restoredBy = actor.userId ? new Types.ObjectId(actor.userId) : undefined;
    // Putting everything back is one change (ADR-041): if any record can't
    // go back, none do, and the bin entry stays whole.
    try {
      await withTransaction(async (session) => {
        // Claim the entry first: only one restore or purge can move it out of
        // the bin, so a purge racing this restore can't delete what it puts back.
        await claimBatch(batch, { status: "restored", restoredAt, restoredBy }, session);
        const records = await DeletedRecordModel.find({ batchId: batch._id }).session(session).lean<{ collectionName: string; doc: Record<string, unknown> }[]>();
        const byCollection = new Map<string, Record<string, unknown>[]>();
        for (const record of records) byCollection.set(record.collectionName, [...(byCollection.get(record.collectionName) ?? []), record.doc]);
        for (const [name, docs] of byCollection) await db().collection(name).insertMany(docs, { session });
        for (const patch of batch.patches) {
          await db()
            .collection(patch.collectionName!)
            .updateOne(
              { _id: patch.documentId } as never,
              patch.op === "pull" ? { $addToSet: { [patch.field!]: patch.value } } : { $set: { [patch.field!]: patch.value } },
              { session },
            );
        }
        await DeletedRecordModel.deleteMany({ batchId: batch._id }, { session });
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictError("Can't restore: something with the same number or code was created since. Rename or remove it first.");
      throw error;
    }
    batch.set({ status: "restored", restoredAt, restoredBy });
    await AuditService.record({ organizationId, actorUserId: actor.userId, action: "record.restored", resourceType: batch.entityType, resourceId: batch.entityId, after: { label: batch.label } });
    return batch;
  },

  /** "Delete forever" before the 30 days are up. */
  async purgeNow(batchId: string, organizationId: string, actor: Actor) {
    await assertSuperAdmin(actor, organizationId);
    const batch = await requireBatch(batchId, organizationId);
    if (batch.status !== "in_bin") throw new BusinessRuleError("Only something still in the recycle bin can be purged");
    await purge(batch, actor.userId);
    return batch;
  },

  /** Purges every batch past its 30 days (run when the bin is opened, and by the daily job). */
  async purgeExpired(organizationId?: string) {
    await connectMongoDB();
    const expired = await DeletionBatchModel.find({ status: "in_bin", purgeAfter: { $lte: new Date() }, ...(organizationId ? { organizationId: new Types.ObjectId(organizationId) } : {}) });
    let purged = 0;
    for (const batch of expired) {
      try {
        await purge(batch, undefined);
        purged += 1;
      } catch (error) {
        // Restored (or purged by another run) since it was listed: not ours to purge.
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    return purged;
  },

  async listBin(organizationId: string) {
    await connectMongoDB();
    return DeletionBatchModel.find({ organizationId: new Types.ObjectId(organizationId), status: "in_bin" }).sort({ deletedAt: -1 }).lean();
  },
};

async function requireBatch(batchId: string, organizationId: string) {
  await connectMongoDB();
  if (!Types.ObjectId.isValid(batchId)) throw new NotFoundError("Recycle bin entry not found");
  const batch = await DeletionBatchModel.findOne({ _id: new Types.ObjectId(batchId), organizationId: new Types.ObjectId(organizationId) });
  if (!batch) throw new NotFoundError("Recycle bin entry not found");
  return batch;
}

/**
 * Moves a bin entry out of `in_bin` as the first write of the caller's
 * transaction (ADR-041), conditional on it still being there. The status
 * check before the transaction only gives a friendly message; this is what
 * stops a restore and a purge (or two of either) both going through.
 */
async function claimBatch(batch: InstanceType<typeof DeletionBatchModel>, set: Record<string, unknown>, session: ClientSession) {
  const claimed = await DeletionBatchModel.updateOne({ _id: batch._id, organizationId: batch.organizationId, status: "in_bin" }, { $set: set }, { session });
  if (claimed.matchedCount === 0) throw new ConflictError("This recycle bin entry was just restored or purged by someone else. Reload and try again.");
}

type StoredFileRef = { kind: "document"; storage: { provider: string; key: string } } | { kind: "photo"; photoStorage: { provider: string; key: string } };

/** Blob-stored files of the records in a batch (documents, clock photos), to remove once the purge commits. */
async function storedFilesOf(batchId: Types.ObjectId, session: ClientSession): Promise<StoredFileRef[]> {
  const records = await DeletedRecordModel.find({
    batchId,
    collectionName: { $in: [EmployeeDocumentModel.collection.collectionName, AttendanceRecordModel.collection.collectionName] },
  })
    .session(session)
    .lean<{ collectionName: string; doc: Record<string, unknown> }[]>();
  const refs: StoredFileRef[] = [];
  const isBlob = (value: unknown): value is { provider: string; key: string } =>
    Boolean(value && typeof value === "object" && (value as { provider?: unknown }).provider === "vercel-blob" && typeof (value as { key?: unknown }).key === "string");
  for (const record of records) {
    if (record.collectionName === EmployeeDocumentModel.collection.collectionName) {
      if (isBlob(record.doc.storage)) refs.push({ kind: "document", storage: record.doc.storage });
      continue;
    }
    for (const event of ["checkIn", "checkOut"]) {
      const photoStorage = (record.doc[event] as { photoStorage?: unknown } | undefined)?.photoStorage;
      if (isBlob(photoStorage)) refs.push({ kind: "photo", photoStorage });
    }
  }
  return refs;
}

async function purge(batch: InstanceType<typeof DeletionBatchModel>, actorUserId: string | undefined) {
  const purgedAt = new Date();
  const files = await withTransaction(async (session) => {
    await claimBatch(batch, { status: "purged", purgedAt }, session);
    const stored = await storedFilesOf(batch._id, session);
    await DeletedRecordModel.deleteMany({ batchId: batch._id }, { session });
    return stored;
  });
  batch.set({ status: "purged", purgedAt });
  // Purged for good, so their files go too. Best effort, after the commit:
  // a blob that fails to delete is orphaned (private, unreachable), never
  // a record pointing at a missing file.
  for (const file of files) {
    await (file.kind === "document" ? DocumentStorage.remove({ storage: file.storage }) : AttendancePhotoStorage.remove({ photoStorage: file.photoStorage })).catch(() => undefined);
  }
  await AuditService.record({
    organizationId: batch.organizationId.toString(),
    actorUserId,
    action: "record.purged",
    resourceType: batch.entityType,
    resourceId: batch.entityId,
    after: { label: batch.label, recordCount: batch.recordCount },
  });
}
