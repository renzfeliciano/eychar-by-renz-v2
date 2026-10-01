import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// classification/status are plain trimmed Strings, validated at the
// service layer via CaseClassificationService/CaseStatusService.assertValidCode
// (same catalog-driven pattern as AttendanceRecord.status/Applicant.stage) —
// never a hardcoded enum here. Field set mirrors the legacy v1 app's real
// Case Monitoring module (caseName/caseNumber/legalCounsel/briefHistory,
// tied to a Project rather than an Employee — cases here are legal/labor/
// property matters the org tracks, not necessarily employee-specific).
const caseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    projectId: { type: Schema.Types.ObjectId, required: true, ref: "Project" },
    caseName: { type: String, required: true, trim: true },
    caseNumber: { type: String, required: true, trim: true },
    classification: { type: String, required: true, trim: true },
    status: { type: String, required: true, trim: true },
    legalCounsel: { type: String, trim: true },
    briefHistory: { type: String, trim: true },
  },
  { timestamps: true },
);

caseSchema.index({ organizationId: 1, status: 1 });
caseSchema.index({ projectId: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
caseSchema.plugin(hiddenPlugin);

export type Case = InferSchemaType<typeof caseSchema>;

export const CaseModel = models.Case ?? model("Case", caseSchema);
