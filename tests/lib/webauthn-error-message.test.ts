import { describe, it, expect } from "vitest";
import { WebAuthnError, type WebAuthnErrorCode } from "@simplewebauthn/browser";
import { describeWebAuthnError } from "@/lib/webauthn-error-message";

function fakeError(code: WebAuthnErrorCode, message = "raw browser message"): WebAuthnError {
  return new WebAuthnError({ code, message, cause: new Error(message) });
}

describe("describeWebAuthnError", () => {
  it("never surfaces the raw NotAllowedError/W3C-spec message to the user", () => {
    // This is the exact case that regressed: the browser's own NotAllowedError
    // text points straight at the WebAuthn spec instead of explaining anything.
    const rawMessage =
      "The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.";
    const error = fakeError("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", rawMessage);

    const authMessage = describeWebAuthnError(error, "authentication");
    const regMessage = describeWebAuthnError(error, "registration");

    expect(authMessage).not.toBe(rawMessage);
    expect(authMessage).not.toMatch(/w3\.org/i);
    expect(regMessage).not.toBe(rawMessage);
    expect(regMessage).not.toMatch(/w3\.org/i);
  });

  it("gives a device-mismatch-aware message for authentication specifically", () => {
    const message = describeWebAuthnError(fakeError("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"), "authentication");
    expect(message).toMatch(/same device and browser/i);
  });

  it("describes an already-registered device distinctly from other errors", () => {
    const message = describeWebAuthnError(fakeError("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"), "registration");
    expect(message).toBe("This device is already registered for biometric verification.");
  });

  it("describes an aborted ceremony (timeout) distinctly", () => {
    const message = describeWebAuthnError(fakeError("ERROR_CEREMONY_ABORTED"), "authentication");
    expect(message).toBe("That took too long and was cancelled. Try again.");
  });

  it("falls back to a friendly message for a non-WebAuthn error", () => {
    const message = describeWebAuthnError(new Error("some other failure"), "authentication");
    expect(message).not.toContain("some other failure");
    expect(message.length).toBeGreaterThan(0);
  });

  it("falls back to a friendly message for a non-Error thrown value", () => {
    const message = describeWebAuthnError("not an error object", "registration");
    expect(message.length).toBeGreaterThan(0);
  });
});
