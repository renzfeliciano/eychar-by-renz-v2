import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// A complaint (incident report) about one employee, tracked across the
// organization's ComplaintStage catalog. `stage` is a plain string validated at
// the service boundary, the same free-form movement Applicant.stage has, and it
// has no default: a new complaint starts in the lowest-sorted active stage, which
// the service reads from the catalog.
const complaintSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    irNumber: { type: String, required: true, trim: true },
    receivedDate: { type: Date, required: true },
    remarks: { type: String, trim: true },
    // Incident details (the first card in the mockup). All optional: intake is never blocked on them.
    // The project (or site) the incident happened at, picked from the organization's Projects list.
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    description: { type: String, trim: true },
    what: { type: String, trim: true },
    where: { type: String, trim: true },
    incidentDate: { type: Date },
    complainantName: { type: String, trim: true },
    stage: { type: String, required: true, trim: true },
    // One section of details per stage code (NTE, hearing, sanction, ...), validated by
    // domains/complaints/stage-sections.ts. Mixed because the field set depends on the stage code.
    stageDetails: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

complaintSchema.index({ organizationId: 1, irNumber: 1 }, { unique: true });
complaintSchema.index({ organizationId: 1, stage: 1 });
complaintSchema.index({ organizationId: 1, employeeId: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
complaintSchema.plugin(hiddenPlugin);

export type Complaint = InferSchemaType<typeof complaintSchema>;

export const ComplaintModel = models.Complaint ?? model("Complaint", complaintSchema);
