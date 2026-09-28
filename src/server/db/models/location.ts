import { Schema, model, models, type InferSchemaType } from "mongoose";

// No effective dating — not in AGENTS.md's example schemas, and locations
// don't have the "reconstruct historical org state" requirement that
// OrganizationUnit/Position do.
const locationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    // Site center + allowed radius for self-service clock-in (ADR-026).
    // Optional as a pair — a location without coordinates just isn't a
    // clock-in site; LocationService enforces "both or neither".
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    geofenceRadiusMeters: { type: Number, min: 10, max: 5000, default: 100 },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

locationSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export type Location = InferSchemaType<typeof locationSchema>;

export const LocationModel = models.Location ?? model("Location", locationSchema);
