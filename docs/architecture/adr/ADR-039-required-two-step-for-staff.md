# ADR-039: Organization can require two-step verification for staff

## Status

Accepted

## Context

Two-step verification (TOTP, ADR-030) was optional. HR and admin accounts can see pay, government
IDs and personal records for everyone, so a single phished password is the biggest remaining risk.
Self-service employee accounts only clock in and out and already prove presence with the device's
passkey and a photo (ADR-020), so forcing an authenticator app on them adds friction for little gain.

## Decision

- **Setting, not code:** `Organization.security.requireTwoStepForStaff` (default `false`), changed by
  the Super Administrator under Settings › Security, audited as `security-settings.updated`.
- **Who it applies to:** "staff" means an account with no linked employee (`User.employeeId` unset),
  i.e. accounts that use the HR workspace. It is data-driven; no role names are checked.
- **No self-lockout:** turning it on is refused unless the acting Super Administrator has two-step on.
  While it's on, staff can't turn their own two-step off (they can still get new recovery codes, and
  an administrator can reset it, after which they're asked to set it up again).
- **Enforcement, server-side:**
  - The jwt callback caches the organization's flag with the idle limit (refreshed on activity) and
    re-reads `mfa.enabled` on every request, setting `mustSetUpTwoStep`.
  - `requireAuthenticatedUser` (and so every `requirePermission`) refuses such a session, except the
    routes that opt in with `allowPendingTwoStepSetup`: `/api/account/mfa` and `/api/account/password`.
  - The HR workspace layout redirects to `/set-up-two-step`, which reuses the account two-step panel
    and moves on to the dashboard once it's on. The page also offers sign-out.
- The settings page shows how many staff accounts don't have two-step yet.

## Consequences

- Turning it on takes effect for everyone at their next activity, without signing anyone out.
- An administrator who resets someone's two-step should expect that person to be sent to set-up at
  their next sign-in.
