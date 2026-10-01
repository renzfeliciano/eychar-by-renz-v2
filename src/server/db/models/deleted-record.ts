import { Schema, model, models } from "mongoose";

// A document removed by a deletion batch, kept exactly as it was (raw BSON)
// so a restore puts back the same _id and fields. One per document, so a
// batch with large files never hits the 16 MB document limit.
const deletedRecordSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, required: true, ref: "DeletionBatch" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    collectionName: { type: String, required: true },
    doc: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

deletedRecordSchema.index({ batchId: 1 });

export const DeletedRecordModel = models.DeletedRecord ?? model("DeletedRecord", deletedRecordSchema);
