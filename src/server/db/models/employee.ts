import { Schema, model, models, type InferSchemaType } from "mongoose";

// Employee is pure identity — no status field of its own. "Is this employee
// currently active" is answered by their latest Employment record, not a
// second flag here that could drift out of sync with it (AGENTS.md §13/§14).
const employeeSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    personId: { type: Schema.Types.ObjectId, required: true, ref: "Person" },
    employeeNumber: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Partial (not plain `sparse`) so multiple employees in the same org can
// omit an employee number (some legacy/imported staff never had one)
// without colliding on this uniqueness check. A compound index only counts
// as "sparse-empty" when EVERY one of its fields is missing — organizationId
// is always present here, so a plain `sparse: true` would still index every
// no-employeeNumber document under the same `null` key and collide. The
// partial filter explicitly excludes documents missing employeeNumber
// instead, which is unaffected by that compound-sparse quirk.
employeeSchema.index(
  { organizationId: 1, employeeNumber: 1 },
  { unique: true, partialFilterExpression: { employeeNumber: { $exists: true } } },
);

export type Employee = InferSchemaType<typeof employeeSchema>;

export const EmployeeModel = models.Employee ?? model("Employee", employeeSchema);
