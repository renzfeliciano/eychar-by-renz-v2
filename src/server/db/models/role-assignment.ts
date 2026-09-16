import { Schema, model, models, type InferSchemaType } from "mongoose";

// `scope` is a discriminated shape so `project` / `organizationUnit` scope
// types can be added in a later phase without a migration (AGENTS.md §21),
// without building the full multi-scope policy-resolution hierarchy now.
const roleAssignmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    roleId: { type: Schema.Types.ObjectId, required: true, ref: "Role" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    scope: {
      type: { type: String, enum: ["organization"], default: "organization", required: true },
    },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

roleAssignmentSchema.index({ userId: 1, organizationId: 1 });
roleAssignmentSchema.index({ roleId: 1 });

export type RoleAssignment = InferSchemaType<typeof roleAssignmentSchema>;

export const RoleAssignmentModel =
  models.RoleAssignment ?? model("RoleAssignment", roleAssignmentSchema);
