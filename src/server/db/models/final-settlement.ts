import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";


export const FINAL_SETTLEMENT_STATUSES = ["draft", "submitted", "reviewed", "approved", "disbursed", "cancelled"] as const;

const lineSchema = new Schema(
  {
    code: { type: String, required: true },
    direction: { type: String, enum: ["earning", "deduction"], required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true },
    source: { type: String, required: true },
    basis: { type: String, required: true },
    clearanceItemId: { type: String },
    manualLineId: { type: String },
  },
  { _id: false },
);

const manualLineSchema = new Schema({
  direction: { type: String, enum: ["earning", "deduction"], required: true },
  label: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  addedBy: { type: Schema.Types.ObjectId, ref: "User" },
  addedAt: { type: Date, required: true, default: () => new Date() },
});

const historySchema = new Schema(
  {
    action: { type: String, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true },
    version: { type: Number },
  },
  { _id: false },
);

// One final settlement per clearance case (ADR-032). `lines` and `inputs`
// are recomputed from live records while it's a draft; from approval on
// they're frozen, so later changes to pay terms or leave never move an
// approved pay-out.
const finalSettlementSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    clearanceCaseId: { type: Schema.Types.ObjectId, required: true, ref: "ClearanceCase" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    status: { type: String, enum: FINAL_SETTLEMENT_STATUSES, required: true, default: "draft" },
    version: { type: Number, required: true, default: 1 },
    lines: { type: [lineSchema], default: [] },
    manualLines: { type: [manualLineSchema], default: [] },
    totals: {
      earnings: { type: Number, required: true, default: 0 },
      deductions: { type: Number, required: true, default: 0 },
      net: { type: Number, required: true, default: 0 },
    },
    // What the computation used: rates, dates, year-to-date figures.
    inputs: { type: Schema.Types.Mixed, default: {} },
    preparedBy: { type: Schema.Types.ObjectId, ref: "User" },
    payment: {
      methodCode: { type: String },
      reference: { type: String, trim: true },
      paidAt: { type: Date },
    },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

finalSettlementSchema.index({ organizationId: 1, clearanceCaseId: 1 }, { unique: true });
finalSettlementSchema.index({ organizationId: 1, status: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
finalSettlementSchema.plugin(hiddenPlugin);

export type FinalSettlement = InferSchemaType<typeof finalSettlementSchema>;

export const FinalSettlementModel = (models.FinalSettlement as Model<FinalSettlement> | undefined) ?? model<FinalSettlement>("FinalSettlement", finalSettlementSchema);
