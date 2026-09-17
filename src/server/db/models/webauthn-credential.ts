import { Schema, model, models, type InferSchemaType } from "mongoose";

// One row per registered platform authenticator (Face ID/Touch ID/Android
// biometric/Windows Hello) for a self-service employee account. publicKey/
// credentialId are stored base64url-encoded — WebAuthnService is the only
// place that decodes them back to bytes for verification.
const webAuthnCredentialSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, ref: "Organization" },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    credentialId: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    deviceType: { type: String },
    backedUp: { type: Boolean, default: false },
    transports: { type: [String], default: [] },
  },
  { timestamps: true },
);

webAuthnCredentialSchema.index({ userId: 1 });

export type WebAuthnCredential = InferSchemaType<typeof webAuthnCredentialSchema>;

export const WebAuthnCredentialModel = models.WebAuthnCredential ?? model("WebAuthnCredential", webAuthnCredentialSchema);
