import { Schema, model, models, type InferSchemaType } from "mongoose";

// A fixed-window counter of sign-in attempts per key (e.g. "ip:203.0.113.7").
// Kept in the database rather than process memory, so the limit holds across
// restarts and across every server instance. MongoDB's TTL monitor deletes
// each window's document once it has expired.
const loginThrottleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    windowStart: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LoginThrottle = InferSchemaType<typeof loginThrottleSchema>;

export const LoginThrottleModel = models.LoginThrottle ?? model("LoginThrottle", loginThrottleSchema);
