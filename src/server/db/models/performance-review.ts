import { Schema, model, models, type InferSchemaType } from "mongoose";

// ratingCode is a plain trimmed String, validated at the service layer via
// PerformanceRatingService.assertValidCode (same catalog-driven pattern as
// AttendanceRecord.status/Applicant.stage) — never a hardcoded enum here.
const performanceReviewSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    reviewCycleId: { type: Schema.Types.ObjectId, required: true, ref: "ReviewCycle" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    reviewerId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    ratingCode: { type: String, trim: true },
    comments: { type: String, trim: true },
    status: { type: String, enum: ["draft", "submitted"], default: "draft", required: true },
    submittedAt: { type: Date },
  },
  { timestamps: true },
);

performanceReviewSchema.index({ organizationId: 1, reviewCycleId: 1, employeeId: 1 }, { unique: true });
performanceReviewSchema.index({ organizationId: 1, employeeId: 1 });

export type PerformanceReview = InferSchemaType<typeof performanceReviewSchema>;

export const PerformanceReviewModel = models.PerformanceReview ?? model("PerformanceReview", performanceReviewSchema);
