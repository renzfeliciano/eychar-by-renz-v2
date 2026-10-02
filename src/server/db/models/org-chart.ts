import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * The organization chart as HR draws it (ADR-046): a free canvas of cards
 * (an employee, or a named group box) and the lines linking each card to the
 * one above it. It replaces the old "reports to" field on assignments; it is
 * the chart people built, not a projection of other data. One per
 * organization, saved whole (cards and links change together).
 */
const orgChartNodeSchema = new Schema(
  {
    // Client-generated, stable across saves, so links can refer to it.
    key: { type: String, required: true, trim: true },
    type: { type: String, enum: ["person", "group"], required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee" },
    label: { type: String, trim: true },
    color: { type: String, trim: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

const orgChartSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    nodes: { type: [orgChartNodeSchema], default: [] },
    // `from` is the card above (parent), `to` the card below (child).
    edges: { type: [new Schema({ from: { type: String, required: true }, to: { type: String, required: true } }, { _id: false })], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

orgChartSchema.index({ organizationId: 1 }, { unique: true });

export type OrgChart = InferSchemaType<typeof orgChartSchema>;
export const OrgChartModel = models.OrgChart ?? model("OrgChart", orgChartSchema);
