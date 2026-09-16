import { Schema, model, models, type InferSchemaType } from "mongoose";

// username and email are both optional-but-sparse-unique: a user needs at
// least one to log in (enforced at the validation boundary, not here — see
// src/shared/validation/auth.ts), but not every account will have both
// (e.g. an HR admin seeded with only a username, no real email yet).
const userSchema = new Schema(
  {
    username: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
    personId: { type: Schema.Types.ObjectId, ref: "Person" },
    status: { type: String, enum: ["active", "disabled"], default: "active", required: true },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = models.User ?? model("User", userSchema);
