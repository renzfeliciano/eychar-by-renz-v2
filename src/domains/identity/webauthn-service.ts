import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel, EmployeeModel, WebAuthnCredentialModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import { BRAND } from "@/lib/brand";

/** The domain and origin WebAuthn credentials are bound to — a credential registered on one origin never validates on another. */
function relyingParty() {
  const url = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  return { rpID: url.hostname, origin: url.origin, rpName: BRAND.fullName };
}

export const WebAuthnService = {
  async generateRegistrationOptions(userId: string) {
    await connectMongoDB();
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const existingCredentials = await WebAuthnCredentialModel.find({ userId: user._id }).lean();
    const { rpID, rpName } = relyingParty();

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      // The UTF-8 bytes of the id — the same user handle v9 derived from the
      // string, so passkeys registered before the upgrade stay tied to this user.
      userID: isoUint8Array.fromUTF8String(user._id.toString()),
      userName: user.username ?? user.email ?? user._id.toString(),
      attestationType: "none",
      // `id` is the base64url credential id, exactly as stored.
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransport[] | undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
    });

    user.webAuthnChallenge = options.challenge;
    await user.save();

    return options;
  },

  async verifyRegistration(userId: string, organizationId: string, response: RegistrationResponseJSON) {
    await connectMongoDB();
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (!user.webAuthnChallenge) throw new BusinessRuleError("No registration in progress for this user");

    const { rpID, origin } = relyingParty();

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: user.webAuthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } finally {
      user.webAuthnChallenge = undefined;
      await user.save();
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BusinessRuleError("Could not verify the biometric registration");
    }

    const { credential: registered, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const credential = await WebAuthnCredentialModel.create({
      organizationId,
      userId: user._id,
      credentialId: registered.id,
      publicKey: Buffer.from(registered.publicKey).toString("base64url"),
      counter: registered.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: response.response.transports ?? [],
    });

    return credential;
  },

  async generateAuthenticationOptions(userId: string) {
    await connectMongoDB();
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    const credentials = await WebAuthnCredentialModel.find({ userId: user._id }).lean();
    if (credentials.length === 0) {
      throw new BusinessRuleError("No biometric device registered for this account yet");
    }

    const { rpID } = relyingParty();

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      // The stored base64url id, byte-for-byte what the authenticator issued —
      // any re-encoding here makes the browser report "no passkeys available".
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransport[] | undefined,
      })),
    });

    user.webAuthnChallenge = options.challenge;
    await user.save();

    return options;
  },

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
    await connectMongoDB();
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    if (!user.webAuthnChallenge) throw new BusinessRuleError("No biometric confirmation in progress for this user");

    const credential = await WebAuthnCredentialModel.findOne({ userId: user._id, credentialId: response.id });
    if (!credential) throw new NotFoundError("Biometric credential not recognized for this account");

    const { rpID, origin } = relyingParty();

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: user.webAuthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64url")),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransport[] | undefined,
        },
      });
    } finally {
      user.webAuthnChallenge = undefined;
      await user.save();
    }

    if (!verification.verified) {
      throw new BusinessRuleError("Could not verify the biometric confirmation");
    }

    credential.counter = verification.authenticationInfo.newCounter;
    await credential.save();

    return { verified: true };
  },

  async hasRegisteredCredential(userId: string) {
    await connectMongoDB();
    return Boolean(await WebAuthnCredentialModel.exists({ userId }));
  },

  /**
   * Removes every credential a self-service account has registered — the
   * only recovery path when someone loses a device, switches phones, or
   * (as happened in dev) registers in the wrong browser. `hasCredential`
   * then goes back to false, so the self-service portal shows "Set up
   * biometric verification" again on whichever device/browser they use
   * next, instead of leaving them permanently locked out with no reset.
   */
  async resetCredentials(userId: string, organizationId: string, actor: { userId?: string }) {
    await connectMongoDB();
    const user = await UserModel.findById(userId);
    if (!user?.employeeId) throw new NotFoundError("User not found in this organization");

    const employeeInOrg = await EmployeeModel.exists({
      _id: user.employeeId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!employeeInOrg) throw new NotFoundError("User not found in this organization");

    const result = await WebAuthnCredentialModel.deleteMany({ userId: user._id });

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "webauthn-credentials.reset",
      resourceType: "User",
      resourceId: user._id.toString(),
      after: { removedCount: result.deletedCount },
    });

    return { removedCount: result.deletedCount };
  },
};
