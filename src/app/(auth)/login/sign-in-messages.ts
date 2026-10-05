/**
 * What the sign-in page says for each outcome the server reports
 * (src/domains/identity/sign-in.ts). A wrong password and an unknown account
 * share one message so the page never confirms which usernames exist.
 */
export const SIGN_IN_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Invalid username/email or password.",
  locked: "This account is locked for 15 minutes after too many failed sign-ins. Try again later, or ask your HR administrator to unlock it.",
  rate_limited: "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
  invalid_otp: "That code didn't work. Enter the newest code from your authenticator app, or use a recovery code.",
  network: "Couldn't reach the server. Check your connection, then try again.",
  server: "The server couldn't finish signing you in. Wait a moment, then try again.",
};

export function signInMessage(code: string): string {
  return SIGN_IN_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
