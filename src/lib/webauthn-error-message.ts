import { WebAuthnError } from "@simplewebauthn/browser";

/**
 * @simplewebauthn/browser deliberately passes the browser's own NotAllowedError
 * message straight through (code "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") rather
 * than explaining it — the WebAuthn spec keeps that case vague on purpose, for
 * privacy, so it reads like raw spec text pointing at a W3C link. Every other
 * code gets a specific, plain-English rewrite; this one gets the best generic
 * explanation we can honestly give, since the browser won't say more.
 */
export function describeWebAuthnError(error: unknown, ceremony: "registration" | "authentication"): string {
  const fallback =
    ceremony === "authentication"
      ? "We couldn't confirm your biometric. Make sure you're using the same device and browser where you registered, then try again."
      : "Biometric setup was cancelled or didn't complete. Try again.";

  if (!(error instanceof Error)) return fallback;
  if (!(error instanceof WebAuthnError)) return fallback;

  switch (error.code) {
    case "ERROR_CEREMONY_ABORTED":
      return "That took too long and was cancelled. Try again.";
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "This device is already registered for biometric verification.";
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
    case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
    case "ERROR_MALFORMED_PUBKEYCREDPARAMS":
      return "This device doesn't support the biometric verification this app requires. Try a different device.";
    case "ERROR_AUTHENTICATOR_GENERAL_ERROR":
      return ceremony === "authentication"
        ? "Your device couldn't complete the biometric confirmation. Try again."
        : "Your device couldn't complete biometric setup. Try again.";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
    case "ERROR_INVALID_USER_ID_LENGTH":
      return "This device isn't set up correctly for biometric verification. Contact your administrator.";
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY":
    default:
      return fallback;
  }
}
