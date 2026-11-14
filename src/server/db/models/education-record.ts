import { Schema, model, models, type InferSchemaType } from "mongoose";

// One qualification on a person's record: a school, optionally the course, optionally the year they
// graduated. Several per level are allowed, so there is no unique index. It belongs to the Person
// (it follows a rehire), and `levelCode` is the code of an EducationLevel catalog item, checked at the
// service boundary (EducationRecordService) like employmentType, not by a schema enum.
const educationRecordSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    personId: { type: Schema.Types.ObjectId, required: true, ref: "Person" },
    levelCode: { type: String, required: true, trim: true },
    school: { type: String, required: true, trim: true, maxlength: 200 },
    course: { type: String, trim: true, maxlength: 200 },
    yearGraduated: { type: Number },
  },
  { timestamps: true },
);

educationRecordSchema.index({ organizationId: 1, personId: 1 });

export type EducationRecord = InferSchemaType<typeof educationRecordSchema>;

export const EducationRecordModel = models.EducationRecord ?? model("EducationRecord", educationRecordSchema);
