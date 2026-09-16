import { Schema } from "mongoose";

/**
 * Shared field shape for the org-managed lookup-list entities that used to
 * be hardcoded Mongoose `enum` arrays (employment type/status, attendance
 * status, recruitment stage, event category, case classification/status)
 * — each still gets its OWN model/collection (matching the existing
 * LeaveType/Position/Project precedent), this factory just avoids
 * retyping the same five fields seven times. `metadata` is the open
 * extension point for future business-rule integrations (e.g. a payroll
 * treatment per attendance status) without a schema change.
 */
export function buildSimpleCatalogSchema() {
  const schema = new Schema(
    {
      organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
      code: { type: String, required: true, trim: true },
      name: { type: String, required: true, trim: true },
      description: { type: String, trim: true },
      sortOrder: { type: Number, required: true, default: 0 },
      metadata: { type: Schema.Types.Mixed, default: {} },
      status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    },
    { timestamps: true },
  );

  schema.index({ organizationId: 1, code: 1 }, { unique: true });
  schema.index({ organizationId: 1, sortOrder: 1 });

  return schema;
}
