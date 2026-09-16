import { Schema, model, models, type InferSchemaType } from "mongoose";

// Permission is a seeded catalog (per AGENTS.md §54) — literal permission
// *keys* like "employees.read" live here as data, never as hardcoded
// role-name checks in application logic.
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    // Groups related permissions for a future permissions-management UI
    // (e.g. "organization", "workforce") — display/filtering only, never
    // read by authorize().
    category: { type: String, required: true, trim: true },
    // Seeded, core permissions this codebase's routes actually check.
    // false is reserved for a future custom/org-defined permission — not
    // introduced yet, so every current row is true.
    isSystem: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

export type Permission = InferSchemaType<typeof permissionSchema>;

export const PermissionModel = models.Permission ?? model("Permission", permissionSchema);
