import { Schema, model, models, type InferSchemaType } from "mongoose";

// `type` is a free-form string, not a hardcoded enum (AGENTS.md §10) — a
// seeded organizationUnitTypes catalog is deferred until a UI actually
// needs a managed dropdown (see ARCHITECTURE.md).
const organizationUnitSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    parentUnitId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit" },
    type: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

organizationUnitSchema.index({ organizationId: 1, code: 1 }, { unique: true });
organizationUnitSchema.index({ parentUnitId: 1 });

export type OrganizationUnit = InferSchemaType<typeof organizationUnitSchema>;

export const OrganizationUnitModel =
  models.OrganizationUnit ?? model("OrganizationUnit", organizationUnitSchema);
