import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// Mirrors the legacy v1 app's Workforce Calendar module. `category` is a
// plain trimmed String validated at the service layer against the
// EventCategory catalog (EventCategoryService.assertValidCode), same
// pattern as every other catalog-driven field in this app. No hard delete
// (AGENTS.md §53) — a mistaken or called-off event is cancelled via
// `status`, not removed, so the calendar simply stops showing it.
const eventSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    time: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, required: true, trim: true, default: "active" },
  },
  { timestamps: true },
);

eventSchema.index({ organizationId: 1, date: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
eventSchema.plugin(hiddenPlugin);

export type Event = InferSchemaType<typeof eventSchema>;

export const EventModel = models.Event ?? model("Event", eventSchema);
