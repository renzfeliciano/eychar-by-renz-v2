import { Schema, model, models, type InferSchemaType } from "mongoose";

// `scope` is a discriminated shape (AGENTS.md §21): `{ type: "organization" }`
// grants the role across the whole organization (and is what every document
// written before scopes existed means, with or without the field);
// `{ type: "project", projectIds }` grants it only on those projects. One
// assignment carries a list of projects rather than one per project, so a
// manager over three sites is one grant, revoked and audited as one.
// `organizationUnit` can be added the same way later without a migration.
const roleAssignmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    roleId: { type: Schema.Types.ObjectId, required: true, ref: "Role" },
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    scope: {
      type: { type: String, enum: ["organization", "project"], default: "organization", required: true },
      // Only for type "project"; absent (not []) on organization-wide assignments.
      projectIds: {
        type: [{ type: Schema.Types.ObjectId, ref: "Project" }],
        default: undefined,
        required: [
          function (this: { get?: (path: string) => unknown }) {
            return typeof this.get === "function" && this.get("scope.type") === "project";
          },
          "A project-scoped role assignment needs at least one project",
        ],
        validate: {
          validator(this: unknown, value: unknown[] | undefined) {
            const doc = this as { scope?: { type?: string }; get?: (path: string) => unknown };
            const type = typeof doc.get === "function" ? doc.get("scope.type") : doc.scope?.type;
            return type === "project" ? Array.isArray(value) && value.length > 0 : value === undefined || value.length === 0;
          },
          message: "A project-scoped role assignment needs at least one project; an organization-wide one takes none",
        },
      },
    },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date },
  },
  { timestamps: true },
);

roleAssignmentSchema.index({ userId: 1, organizationId: 1 });
roleAssignmentSchema.index({ roleId: 1 });
// RoleAssignmentService.listForOrganization: the organization's assignments, newest first.
roleAssignmentSchema.index({ organizationId: 1, createdAt: -1 });

export type RoleAssignment = InferSchemaType<typeof roleAssignmentSchema>;

export const RoleAssignmentModel =
  models.RoleAssignment ?? model("RoleAssignment", roleAssignmentSchema);
