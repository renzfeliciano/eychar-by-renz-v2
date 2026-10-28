import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// A probation evaluation handled outside EychAr (ADR-053): HR sent the
// paper or emailed form to the evaluator, or the evaluation came back done.
// Recording it takes the "Evaluate … before regularization" row off the
// dashboard for that probation (`dueKey`); the record stays for reference.
const evaluationFollowUpSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // The regularization date ("YYYY-MM-DD") the dashboard item was about, so
    // a record answers that probation only (a rehire or a new hire date shows again).
    dueKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    outcome: { type: String, enum: ["sent", "completed"], required: true },
    // When it was sent, or when the evaluation was completed.
    actionDate: { type: Date, required: true },
    // Who it was sent to, as HR writes it ("Engr. Santos, Building Administrator").
    sentTo: { type: String, trim: true },
    remarks: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
    // "withdrawn" when HR undoes it; never deleted.
    status: { type: String, enum: ["active", "withdrawn"], default: "active", required: true },
  },
  { timestamps: true },
);

// The dashboard reads the active records of an organization; the profile, one employee's.
evaluationFollowUpSchema.index({ organizationId: 1, status: 1, employeeId: 1 });
// One active record per probation: recording again replaces it.
evaluationFollowUpSchema.index({ organizationId: 1, employeeId: 1, dueKey: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

evaluationFollowUpSchema.plugin(hiddenPlugin);

export type EvaluationFollowUp = InferSchemaType<typeof evaluationFollowUpSchema>;

export const EvaluationFollowUpModel = (models.EvaluationFollowUp as Model<EvaluationFollowUp> | undefined) ?? model<EvaluationFollowUp>("EvaluationFollowUp", evaluationFollowUpSchema);
