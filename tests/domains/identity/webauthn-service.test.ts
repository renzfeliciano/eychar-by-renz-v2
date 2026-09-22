import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, UserModel, WebAuthnCredentialModel } from "@/server/db/models";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

// verifyRegistration/verifyAuthentication need a real signed response from an
// actual (or virtual) FIDO2 authenticator, which this suite doesn't fabricate
// — those two are exercised indirectly wherever a caller mocks
// WebAuthnService.verifyAuthentication (see self-service-attendance-service.test.ts).
// Everything below is real, unmocked DB behavior.

async function seedUser(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-webauthn-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  const user = await UserModel.create({ username: `jane.${suffix}.${Date.now()}`, passwordHash: "x", employeeId: employee._id });
  return { organization, user };
}

describe("WebAuthnService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("generates registration options and persists the challenge on the user", async () => {
    const { user } = await seedUser("1");

    const options = await WebAuthnService.generateRegistrationOptions(user._id.toString());

    expect(options.challenge).toBeTruthy();
    expect(options.user.id).toBe(user._id.toString());

    const reloaded = await UserModel.findById(user._id);
    expect(reloaded?.webAuthnChallenge).toBe(options.challenge);
  });

  it("throws for a user that doesn't exist", async () => {
    await expect(WebAuthnService.generateRegistrationOptions("000000000000000000000000")).rejects.toThrow(NotFoundError);
  });

  it("refuses to start an authentication ceremony when no credential is registered yet", async () => {
    const { user } = await seedUser("2");

    await expect(WebAuthnService.generateAuthenticationOptions(user._id.toString())).rejects.toThrow(BusinessRuleError);
  });

  it("reports no registered credential for a fresh account", async () => {
    const { user } = await seedUser("3");

    expect(await WebAuthnService.hasRegisteredCredential(user._id.toString())).toBe(false);
  });

  it("removes every registered credential for a user, so they can register fresh on a new device/browser", async () => {
    const { organization, user } = await seedUser("4");
    await WebAuthnCredentialModel.create({
      organizationId: organization._id,
      userId: user._id,
      credentialId: `cred-a-${Date.now()}`,
      publicKey: "pub-a",
      counter: 0,
    });
    await WebAuthnCredentialModel.create({
      organizationId: organization._id,
      userId: user._id,
      credentialId: `cred-b-${Date.now()}`,
      publicKey: "pub-b",
      counter: 0,
    });
    expect(await WebAuthnService.hasRegisteredCredential(user._id.toString())).toBe(true);

    await WebAuthnService.resetCredentials(user._id.toString(), organization._id.toString(), {});

    expect(await WebAuthnService.hasRegisteredCredential(user._id.toString())).toBe(false);
  });

  it("rejects resetting credentials for a user outside the organization", async () => {
    const { user } = await seedUser("5");
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: `other-webauthn-${Date.now()}-${Math.random()}` });

    await expect(WebAuthnService.resetCredentials(user._id.toString(), otherOrganization._id.toString(), {})).rejects.toThrow(
      NotFoundError,
    );
  });
});
