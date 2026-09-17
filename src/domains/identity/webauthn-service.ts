import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel, WebAuthnCredentialModel } from "@/server/db/models";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

/** The domain and origin WebAuthn credentials are bound to — a credential registered on one origin never validates on another. */
function relyingParty() {
  const url = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");
  return { rpID: url.hostname, origin: url.origin, rpName: "WorkforceHub" };
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
      userID: user._id.toString(),
      userName: user.username ?? user.email ?? user._id.toString(),
      attestationType: "none",
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credentialId,
        type: "public-key" as const,
        transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
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

    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const credential = await WebAuthnCredentialModel.create({
      organizationId,
      userId: user._id,
      credentialId: Buffer.from(credentialID).toString("base64url"),
      publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
      counter,
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
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        type: "public-key" as const,
        transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
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
        authenticator: {
          credentialID: Buffer.from(credential.credentialId, "base64url"),
          credentialPublicKey: Buffer.from(credential.publicKey, "base64url"),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
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
};
