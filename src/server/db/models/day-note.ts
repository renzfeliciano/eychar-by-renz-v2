import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// HR's free-form note on one calendar day of the organization ("Typhoon
// signal #2: skeleton crew"), shown on the Schedules day panel (ADR-035).
// One per organization per day (unique index); clearing it sets `status`
// to "cleared" rather than deleting (AGENTS.md §53), keeping the audit trail
// readable.
const dayNoteSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    date: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, required: true, trim: true, default: "active" },
  },
  { timestamps: true },
);

dayNoteSchema.index({ organizationId: 1, date: 1 }, { unique: true });

dayNoteSchema.plugin(hiddenPlugin);

export type DayNote = InferSchemaType<typeof dayNoteSchema>;

export const DayNoteModel = models.DayNote ?? model("DayNote", dayNoteSchema);
