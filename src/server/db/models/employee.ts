import { Schema, model, models, type InferSchemaType } from "mongoose";

// Employee is pure identity — no status field of its own. "Is this employee
// currently active" is answered by their latest Employment record, not a
// second flag here that could drift out of sync with it (AGENTS.md §13/§14).
const employeeSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    personId: { type: Schema.Types.ObjectId, required: true, ref: "Person" },
    employeeNumber: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

employeeSchema.index({ organizationId: 1, employeeNumber: 1 }, { unique: true });

export type Employee = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel = models.Employee ?? model("Employee", employeeSchema);
