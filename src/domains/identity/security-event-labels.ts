/** Plain-language names for account security events in the audit trail. */
export const SECURITY_EVENT_LABELS: Record<string, string> = {
  "auth.signed-in": "Signed in",
  "auth.sign-in-failed": "Failed sign-in (wrong password or code)",
  "auth.account-locked": "Account locked after failed sign-ins",
  "auth.account-unlocked": "Unlocked by an administrator",
  "auth.password-changed": "Password changed",
  "auth.password-reset": "Password reset by an administrator",
  "auth.account-disabled": "Account disabled",
  "auth.account-enabled": "Account re-enabled",
  "auth.mfa-enabled": "Two-step verification turned on",
  "auth.mfa-disabled": "Two-step verification turned off",
  "auth.mfa-reset": "Two-step verification reset by an administrator",
  "auth.recovery-code-used": "Signed in with a recovery code",
  "auth.mfa-recovery-codes-regenerated": "New recovery codes generated",
};

/** Events worth drawing the eye to on a Security page. */
export const WARNING_SECURITY_EVENTS = new Set(["auth.sign-in-failed", "auth.account-locked", "auth.account-disabled", "auth.recovery-code-used", "auth.mfa-disabled", "auth.mfa-reset", "auth.password-reset"]);

/** "payroll-run.approved" → "Payroll run approved"; security events use their own labels. */
export function describeAuditAction(action: string): string {
  if (SECURITY_EVENT_LABELS[action]) return SECURITY_EVENT_LABELS[action];
  const [area, verb = ""] = action.split(".");
  const words = `${area.replace(/-/g, " ")} ${verb.replace(/-/g, " ")}`.trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
