import { Schema, model, models, type InferSchemaType } from "mongoose";

// Permission is a seeded catalog (per AGENTS.md §54) — literal permission
// *keys* like "employees.read" live here as data, never as hardcoded
// role-name checks in application logic.
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
  },
  { timestamps: true },
);

export type Permission = InferSchemaType<typeof permissionSchema>;

export const PermissionModel = models.Permission ?? model("Permission", permissionSchema);
