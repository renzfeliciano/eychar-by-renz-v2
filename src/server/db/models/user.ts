import { Schema, model, models, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    personId: { type: Schema.Types.ObjectId, ref: "Person" },
    status: { type: String, enum: ["active", "disabled"], default: "active", required: true },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = models.User ?? model("User", userSchema);
