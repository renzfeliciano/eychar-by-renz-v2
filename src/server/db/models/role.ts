import { Schema, model, models, type InferSchemaType } from "mongoose";

// A Role's permission set is small and always read together with the role
// itself, so it's embedded as permissionKeys rather than a separate
// role-permission join collection (see ARCHITECTURE.md, embedding vs
// references). Roles are org-scoped seeded data, never hardcoded role
// names in authorization logic (AGENTS.md §20/§55).
const roleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissionKeys: { type: [String], default: [] },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    // "super_admin": the one protected role that passes every check (SuperAdminService).
    // Set only by the seed script; never created, edited or assigned through the app.
    system: { type: String, enum: ["super_admin"] },
  },
  { timestamps: true },
);

roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export type Role = InferSchemaType<typeof roleSchema>;

export const RoleModel = models.Role ?? model("Role", roleSchema);
