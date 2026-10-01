import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// One recycle-bin entry: something the Super Administrator deleted, with
// everything that went with it (ADR-033). The removed documents live in
// DeletedRecord until restored or purged after `purgeAfter`.
const deletionBatchSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: ["in_bin", "restored", "purged"], required: true, default: "in_bin" },
    summary: { type: [{ label: String, count: Number, _id: false }], default: [] },
    recordCount: { type: Number, required: true, default: 0 },
    // Changes made to records that stayed (removed from a shared travel order, manager cleared), undone on restore.
    patches: { type: [{ collectionName: String, documentId: Schema.Types.Mixed, op: String, field: String, value: Schema.Types.Mixed, _id: false }], default: [] },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, required: true, default: () => new Date() },
    purgeAfter: { type: Date, required: true },
    restoredBy: { type: Schema.Types.ObjectId, ref: "User" },
    restoredAt: { type: Date },
    purgedAt: { type: Date },
  },
  { timestamps: true },
);

deletionBatchSchema.index({ organizationId: 1, status: 1, deletedAt: -1 });
deletionBatchSchema.index({ status: 1, purgeAfter: 1 });

export type DeletionBatch = InferSchemaType<typeof deletionBatchSchema>;

export const DeletionBatchModel = (models.DeletionBatch as Model<DeletionBatch> | undefined) ?? model<DeletionBatch>("DeletionBatch", deletionBatchSchema);
