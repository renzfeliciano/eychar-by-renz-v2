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
    // Set only for an employee self-service login (created explicitly by
    // HR via EmployeeAccountService, never auto-provisioned at hire) —
    // its presence is what self-service routes check to resolve "this
    // session's own employee record", instead of trusting a client-
    // supplied employeeId. Absent for every HR/admin account.
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee" },
    status: { type: String, enum: ["active", "disabled"], default: "active", required: true },
    // Single-active-session enforcement (src/server/auth/session-policy.ts):
    // each login overwrites this, so an older session's token stops
    // matching and reports "signed in elsewhere" instead of silently
    // sharing the account across devices.
    activeSessionId: { type: String },
    lastActivityAt: { type: Date },
    // Ephemeral: holds the WebAuthn challenge between "generate options"
    // and "verify response" for whichever ceremony (registration or
    // authentication) is in flight, then is cleared. Not a security
    // secret in the same sense as passwordHash — a challenge is only
    // useful for one specific in-progress ceremony.
    webAuthnChallenge: { type: String },

    // Sign-in protection (src/domains/identity/login-guard.ts): consecutive
    // wrong passwords, and the lock they trigger.
    failedSignInCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastSignInAt: { type: Date },
    lastSignInIp: { type: String },

    // Password lifecycle: an account created or reset by an administrator
    // must choose its own password at the next sign-in.
    passwordChangedAt: { type: Date },
    mustChangePassword: { type: Boolean, default: false },

    // Two-factor sign-in with an authenticator app (TOTP, RFC 6238). The
    // secret is stored encrypted (src/server/auth/secret-box.ts); recovery
    // codes only as hashes. `pendingSecret` holds an enrollment in progress.
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String },
      pendingSecret: { type: String },
      recoveryCodeHashes: { type: [String], default: undefined },
      enabledAt: { type: Date },
      // The last accepted time step, so one code can't be replayed.
      lastUsedStep: { type: Number },
    },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof userSchema>;

export const UserModel = models.User ?? model("User", userSchema);
