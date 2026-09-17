import { Schema, model, models, type InferSchemaType } from "mongoose";

// Mirrors the legacy v1 app's Asset Issuance Logging module. `condition` is
// a fixed, small enum in v1 itself (not one of the org-managed catalogs
// this app introduced for employment/attendance/recruitment/etc.), so it
// stays a plain Mongoose enum here too rather than becoming a catalog.
export const ASSET_CONDITIONS = ["Good", "Fair", "Damaged", "Lost"] as const;

const assetIssuanceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    assetName: { type: String, required: true, trim: true },
    assetType: { type: String, trim: true },
    serialNumber: { type: String, trim: true },
    condition: { type: String, required: true, enum: ASSET_CONDITIONS },
    issuedDate: { type: Date, required: true },
    returnedDate: { type: Date },
    remarks: { type: String, trim: true },
  },
  { timestamps: true },
);

assetIssuanceSchema.index({ organizationId: 1, employeeId: 1 });

export type AssetIssuance = InferSchemaType<typeof assetIssuanceSchema>;

export const AssetIssuanceModel = models.AssetIssuance ?? model("AssetIssuance", assetIssuanceSchema);
