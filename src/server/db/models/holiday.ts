import { Schema, model, models, type InferSchemaType } from "mongoose";
import { hiddenPlugin } from "../hidden-plugin";

// The organization's holiday calendar (AGENTS.md §"HolidayCalendar",
// ADR-035): data HR owns, not dates baked into code. A country preset (the
// Philippines today) only *proposes* entries; HR reviews and saves them
// here, and adds local or late-proclaimed holidays by hand. `date` is UTC
// midnight of the calendar day, like ScheduleEntry/AttendanceRecord. No
// hard delete (AGENTS.md §53): a wrong entry is cancelled via `status`.
const holidaySchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    date: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    // Same list as HOLIDAY_TYPES (src/domains/holidays/holiday-types.ts).
    type: { type: String, enum: ["regular", "special_non_working", "special_working"], required: true },
    // Where it applies when it isn't nationwide ("Cebu City"); empty = everywhere.
    scope: { type: String, trim: true },
    // The legal basis or where HR got it ("Proclamation No. 1006, s. 2025").
    source: { type: String, trim: true },
    // Set when loaded from a country preset ("PH"); absent for manual entries.
    presetKey: { type: String, trim: true },
    status: { type: String, required: true, trim: true, default: "active" },
  },
  { timestamps: true },
);

holidaySchema.index({ organizationId: 1, date: 1 });

// Test data the Super Administrator hid is left out of reads for everyone else (ADR-034).
holidaySchema.plugin(hiddenPlugin);

export type Holiday = InferSchemaType<typeof holidaySchema>;

export const HolidayModel = models.Holiday ?? model("Holiday", holidaySchema);
