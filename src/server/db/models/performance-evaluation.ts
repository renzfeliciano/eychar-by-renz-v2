import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * One filled-in Employee Performance Evaluation Form (PCAS-HRMD-FR-004, ADR-051).
 * Event-driven per employee (contractual, probationary, regularization), not
 * tied to a ReviewCycle; the older single-rating PerformanceReview stays as
 * read-only history. The criteria and rating scale live in the versioned form
 * template (evaluation-template.ts); this record keeps the version it used.
 */
const acknowledgmentSchema = new Schema(
  {
    typedName: { type: String, required: true, trim: true },
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const performanceEvaluationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // The evaluator of record: only they (or HR oversight) can fill and submit it.
    evaluatorEmployeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    // Catalog code (EvaluationType), validated at the service boundary.
    evaluationFor: { type: String, required: true, trim: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    templateVersion: { type: Number, required: true },
    ratings: { type: [new Schema({ criterionKey: { type: String, required: true }, rating: { type: String, enum: ["S", "A", "NI"], required: true } }, { _id: false })], default: [] },
    goals: { type: String, trim: true },
    evaluatorComments: { type: String, trim: true },
    status: { type: String, enum: ["draft", "submitted", "acknowledged"], default: "draft", required: true },
    // Who the evaluator was matched by, and whether HR overrode the rule.
    evaluatorOverride: { type: Boolean, default: false },
    // Copied when submitted, so the printed form never changes if the profile does.
    snapshot: {
      type: new Schema(
        {
          employeeName: String,
          evaluatorName: String,
          jobTitle: String,
          projectName: String,
          evaluationForName: String,
        },
        { _id: false },
      ),
    },
    submittedAt: { type: Date },
    evaluatorAcknowledgment: { type: acknowledgmentSchema },
    employeeAcknowledgment: {
      type: new Schema(
        {
          typedName: { type: String, required: true, trim: true },
          at: { type: Date, required: true },
          byUserId: { type: Schema.Types.ObjectId, ref: "User" },
          comments: { type: String, trim: true },
        },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

performanceEvaluationSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });
performanceEvaluationSchema.index({ organizationId: 1, evaluatorEmployeeId: 1, createdAt: -1 });
performanceEvaluationSchema.index({ organizationId: 1, createdAt: -1 });

export type PerformanceEvaluation = InferSchemaType<typeof performanceEvaluationSchema>;

export const PerformanceEvaluationModel = models.PerformanceEvaluation ?? model("PerformanceEvaluation", performanceEvaluationSchema);
