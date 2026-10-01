import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, UserModel, WebAuthnCredentialModel } from "@/server/db/models";
import { WebAuthnService, WEBAUTHN_CHALLENGE_TTL_MS } from "@/domains/identity/webauthn-service";
import { BusinessRuleError } from "@/shared/errors";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

async function seedUser() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-wa-challenge-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `EMP-${Date.now()}-${Math.random()}` });
  const user = await UserModel.create({ username: `wa.${Date.now()}.${Math.random()}`, passwordHash: "x", employeeId: employee._id });
  return { organizationId: organization._id.toString(), userId: user._id.toString(), userObjectId: user._id };
}

const fakeRegistration = { id: "x", rawId: "x", type: "public-key", response: { clientDataJSON: "", attestationObject: "" }, clientExtensionResults: {} } as unknown as RegistrationResponseJSON;

describe("WebAuthn challenges", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("stores the ceremony type and a two-minute expiry with the challenge", async () => {
    const { userId } = await seedUser();
    const before = Date.now();
    const options = await WebAuthnService.generateRegistrationOptions(userId);
    const user = await UserModel.findById(userId).lean();
    expect(user!.webAuthnChallenge).toBe(options.challenge);
    expect(user!.webAuthnChallengeType).toBe("registration");
    const expiresAt = new Date(user!.webAuthnChallengeExpiresAt!).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + WEBAUTHN_CHALLENGE_TTL_MS - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS);
  });

  it("refuses an expired challenge, and clears it", async () => {
    const { organizationId, userId } = await seedUser();
    await WebAuthnService.generateRegistrationOptions(userId);
    await UserModel.updateOne({ _id: userId }, { $set: { webAuthnChallengeExpiresAt: new Date(Date.now() - 1000) } });

    await expect(WebAuthnService.verifyRegistration(userId, organizationId, fakeRegistration)).rejects.toThrow(/timed out/);
    expect((await UserModel.findById(userId).lean())!.webAuthnChallenge).toBeFalsy();
  });

  it("refuses a challenge issued for the other ceremony", async () => {
    const { organizationId, userId, userObjectId } = await seedUser();
    await WebAuthnCredentialModel.create({ organizationId, userId: userObjectId, credentialId: Buffer.from(`cred-${Date.now()}-${Math.random()}`).toString("base64url"), publicKey: "pub", counter: 0 });
    await WebAuthnService.generateAuthenticationOptions(userId);

    await expect(WebAuthnService.verifyRegistration(userId, organizationId, fakeRegistration)).rejects.toThrow(BusinessRuleError);
    expect((await UserModel.findById(userId).lean())!.webAuthnChallenge).toBeFalsy();
  });

  it("spends the challenge on a failed verification, so it can't be retried", async () => {
    const { organizationId, userId, userObjectId } = await seedUser();
    await WebAuthnCredentialModel.create({ organizationId, userId: userObjectId, credentialId: Buffer.from(`known-${Math.random()}`).toString("base64url"), publicKey: "pub", counter: 0 });
    await WebAuthnService.generateAuthenticationOptions(userId);
    const bogus = { id: "not-a-registered-credential", rawId: "x", type: "public-key", response: {}, clientExtensionResults: {} } as unknown as AuthenticationResponseJSON;

    await expect(WebAuthnService.verifyAuthentication(userId, bogus)).rejects.toThrow();
    expect((await UserModel.findById(userId).lean())!.webAuthnChallenge).toBeFalsy();
    await expect(WebAuthnService.verifyAuthentication(userId, bogus)).rejects.toThrow(/No biometric confirmation in progress/);
  });
});
