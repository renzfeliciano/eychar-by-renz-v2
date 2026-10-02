import { Schema, model, models, type InferSchemaType } from "mongoose";

// Following AGENTS.md §15's own example schema. Moving an employee never
// edits a row in place — the current row's effectiveTo is closed and a new
// row is created (see EmployeeAssignmentService.transfer), so historical
// organizational state stays reconstructable (§16) without relying on
// AuditLog for it.
const employeeAssignmentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: "Employee" },
    positionId: { type: Schema.Types.ObjectId, ref: "Position" },
    organizationUnitId: { type: Schema.Types.ObjectId, ref: "OrganizationUnit" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    locationId: { type: Schema.Types.ObjectId, ref: "Location" },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
  },
  { timestamps: true },
);

employeeAssignmentSchema.index({ employeeId: 1, effectiveFrom: 1 });
// Every assignment in the organization in effect on a date.
employeeAssignmentSchema.index({ organizationId: 1, effectiveFrom: 1 });

export type EmployeeAssignment = InferSchemaType<typeof employeeAssignmentSchema>;

export const EmployeeAssignmentModel =
  models.EmployeeAssignment ?? model("EmployeeAssignment", employeeAssignmentSchema);
