import { Schema, model, models, type InferSchemaType } from "mongoose";
import { SESSION_IDLE_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-idle";

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Security settings the Super Administrator controls (Settings › Security).
    security: {
      // Signed out after this long without activity; warned for the last idleWarningSeconds.
      // The defaults come from the same constants as SecuritySettingsService, so the two can't disagree
      // (the schema default once said 60 while the service said 30 minutes, and the schema's won: it is saved into each new organization).
      idleTimeoutSeconds: { type: Number, min: 30, max: 86_400, default: SESSION_IDLE_MS / 1000 },
      idleWarningSeconds: { type: Number, min: 5, max: 3_600, default: SESSION_IDLE_WARNING_MS / 1000 },
      // Staff (HR/admin) accounts must use two-step verification; self-service
      // employee accounts are exempt (they clock in with their own device).
      requireTwoStepForStaff: { type: Boolean, default: false },
    },
    // The employer's BIR registration, printed on Form 2316 (payroll plan Phase 4; one BIR employer per organization).
    tax: {
      tin: { type: String, trim: true },
      registeredName: { type: String, trim: true },
      registeredAddress: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      rdoCode: { type: String, trim: true },
    },
    // Compliance deadlines the dashboard watches (configuration, not code).
    compliance: {
      // Days after the last working day by which final pay must be released
      // (30 under DOLE Labor Advisory No. 06-2020, unless policy says sooner).
      finalPayDays: { type: Number, min: 1, max: 365, default: 30 },
    },
  },
  { timestamps: true },
);

export type Organization = InferSchemaType<typeof organizationSchema>;

export const OrganizationModel =
  models.Organization ?? model("Organization", organizationSchema);
