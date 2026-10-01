import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// Mirrors the legacy v1 app's Travel Orders Logging module: one or more
// employees dispatched for a date range. No hard delete (AGENTS.md §53) —
// a travel order that's called off is cancelled via `status`, not removed.
const travelOrderSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Employee" }],
      required: true,
      validate: { validator: (value: unknown[]) => value.length > 0, message: "At least one employee is required" },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    remarks: { type: String, trim: true },
    status: { type: String, required: true, trim: true, default: "scheduled" },
  },
  { timestamps: true },
);

travelOrderSchema.index({ organizationId: 1, startDate: -1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
travelOrderSchema.plugin(hiddenPlugin);

export type TravelOrder = InferSchemaType<typeof travelOrderSchema>;

export const TravelOrderModel = models.TravelOrder ?? model("TravelOrder", travelOrderSchema);
